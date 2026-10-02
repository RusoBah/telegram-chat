import { useEffect, useRef, useState } from 'react';
import intlTelInput from 'intl-tel-input';
import ru from 'intl-tel-input/locale/ru';
import 'intl-tel-input/styles';
import './App.css';

const stateLabels = {
  authorized: 'Инстанс подключён и авторизован',
  notAuthorized: 'Инстанс не авторизован',
  starting: 'Инстанс запускается',
  pendingPassword: 'Требуется пароль двухфакторной аутентификации',
  suspended: 'Для аккаунта действуют временные ограничения',
  blocked: 'Аккаунт заблокирован',
};

function App() {
  /** Параметры инстанса, введённые в форму подключения. */
  const [form, setForm] = useState({
    apiUrl: '',
    idInstance: '',
    apiTokenInstance: '',
  });
  /** Текст результата проверки подключения. */
  const [status, setStatus] = useState('');

  /** Показывает, выполняется ли проверка подключения. */
  const [isLoading, setIsLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);

  /** Разрешает показать поиск получателя после авторизации инстанса. */
  const [isConnected, setIsConnected] = useState(false);

  /** Текст нового сообщения. */
  const [messageText, setMessageText] = useState('');

  /** Результат попытки отправки. */
  const [sendStatus, setSendStatus] = useState('');

  /** Блокирует повторное нажатие во время запроса. */
  const [isSending, setIsSending] = useState(false);

  const phoneInputRef = useRef(null);
  const phoneItiRef = useRef(null);

  /** Ответы получателя, загруженные с сервера. */
  const [incomingMessages, setIncomingMessages] = useState([]);

  /** Состояние проверки ответов. */
  const [receiveStatus, setReceiveStatus] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);

  /** Последние найденные чаты для подключённого инстанса. */
  const [chatHistory, setChatHistory] = useState([]);
  const [historyKey, setHistoryKey] = useState(null);

  useEffect(() => {
    if (!historyKey) return;
    try {
      localStorage.setItem(historyKey, JSON.stringify(chatHistory));
    } catch {
      // История остаётся доступной до закрытия страницы.
    }
  }, [chatHistory, historyKey]);

  useEffect(() => {
    const input = phoneInputRef.current;
    if (!input) return undefined;

    const iti = intlTelInput(input, {
      initialCountry: 'ru',
      countryNameLocale: 'ru',
      uiTranslations: ru,
      loadUtils: () => import('intl-tel-input/utils'),
    });
    phoneItiRef.current = iti;

    return () => {
      iti.destroy();
      phoneItiRef.current = null;
    };
  }, [isConnected]);

  /** Текст результата поиска получателя. */
  const [recipientStatus, setRecipientStatus] = useState('');

  /** Идентификатор найденного чата; null означает, что чат ещё не найден. */
  const [chatId, setChatId] = useState(null);

  /**
   * Обновляет поле параметров подключения.
   * Атрибут name у input определяет, какое свойство form изменить.
   */
  const updateField = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  const selectChat = (selectedChatId) => {
    setChatId(selectedChatId);
    setIncomingMessages([]);
    setReceiveStatus('');
    setSendStatus('');
  };

  const removeChatFromHistory = (removedChatId) => {
    setChatHistory((current) => current.filter((chat) => chat.chatId !== removedChatId));
  };

  /**
   * 
   * Отправляет параметры инстанса серверу и показывает его состояние.
   */
  const checkConnection = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setIsConnected(false);
    setChatId(null);
    setHistoryKey(null);
    setChatHistory([]);
    setStatus('Проверяем подключение...');

    try {

      const response = await fetch('/api/connection/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Ошибка проверки');
      }

      /** Поиск получателя доступен только авторизованному инстансу. */
      const authorized = data.stateInstance === 'authorized';
      setIsConnected(authorized);
      if (authorized) {
        const key = `telegram-chat-history:${form.apiUrl.trim()}:${form.idInstance.trim()}`;
        let savedHistory = [];
        try {
          const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
          if (Array.isArray(parsed)) {
            savedHistory = parsed.filter(
              (chat) => chat && typeof chat.chatId === 'string' && /^\d+$/.test(chat.chatId),
            ).slice(0, 10).map((chat) => ({
              chatId: chat.chatId,
              phoneNumber: typeof chat.phoneNumber === 'string' ? chat.phoneNumber : '',
              name: typeof chat.name === 'string' ? chat.name : '',
              hasReply: chat.hasReply === true,
              lastSentAt: Number.isInteger(chat.lastSentAt) ? chat.lastSentAt : null,
            }));
          }
        } catch {
          // Повреждённая запись не мешает работе формы.
        }
        setChatHistory(savedHistory);
        setHistoryKey(key);
      }

      setStatus(
        stateLabels[data.stateInstance] ??
        `Состояние инстанса: ${data.stateInstance}`,
      );
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  /**
  * Проверяет номер получателя через сервер и сохраняет найденный chatId.
  */
  const findRecipient = async (event) => {
    event.preventDefault();
    setChatId(null);
    setIncomingMessages([]);
    setReceiveStatus('');
    setSendStatus('');
    setRecipientStatus('Ищем получателя...');

    try {
      await phoneItiRef.current?.promise;
      const internationalNumber = phoneItiRef.current?.getNumber() || '';
      if (!internationalNumber.trim()) {
        throw new Error('Введите номер телефона');
      }

      const response = await fetch('/api/recipient/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          phoneNumber: internationalNumber,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Ошибка поиска');
      }

      if (!data.exist) {
        setRecipientStatus(
          'Аккаунт не найден или номер скрыт настройками Telegram',
        );
        return;
      }

      setChatId(data.chatId);
      setChatHistory((current) => {
        const previous = current.find((chat) => chat.chatId === data.chatId);
        return [{
          chatId: data.chatId,
          phoneNumber: data.phoneNumber || previous?.phoneNumber || internationalNumber,
          name: data.name || previous?.name || '',
          hasReply: previous?.hasReply ?? false,
          lastSentAt: previous?.lastSentAt ?? null,
        }, ...current.filter((chat) => chat.chatId !== data.chatId)].slice(0, 10);
      });
      setRecipientStatus('Получатель найден');
    } catch (error) {
      setRecipientStatus(error.message);
    }
  }

  /**
  * Отправляет текст найденному получателю.
  */
  const sendMessage = async (event) => {
    event.preventDefault();
    setIsSending(true);
    setSendStatus('Передаём сообщение...');
    const sentAt = Math.floor(Date.now() / 1000);

    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          chatId,
          message: messageText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Ошибка отправки');
      }

      setSendStatus(`Сообщение поставлено в очередь. ID: ${data.idMessage}`);
      setMessageText('');
      setChatHistory((current) => current.map((chat) => chat.chatId === chatId ? {
        ...chat,
        lastSentAt: sentAt,
        hasReply: false,
      } : chat));
    } catch (error) {
      setSendStatus(error.message);
    } finally {
      setIsSending(false);
    }
  };

  /**
   * Просит сервер обрабатывать очередь и показывать ответы чата
   */
  const receiveMessage = async () => {
    setIsReceiving(true);
    setReceiveStatus('Проверяем ответы...');

    try {
      const response = await fetch('/api/messages/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, chatId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Не удалось получить ответы');
      }

      setIncomingMessages(data.messages);
      const latestByChat = new Map((data.incomingChats ?? []).map(
        (chat) => [chat.chatId, chat.timestamp],
      ));
      setChatHistory((current) => current.map((chat) => ({
        ...chat,
        hasReply: chat.hasReply || (chat.lastSentAt !== null
          && (latestByChat.get(chat.chatId) ?? 0) >= chat.lastSentAt),
      })));
      setReceiveStatus(`Входящих сообщений в истории: ${data.messages.length}`);
    } catch (error) {
      setReceiveStatus(error.message);
    } finally {
      setIsReceiving(false);
    }
  }

  return (
    <main className="page">
      <div className="workspace-layout">
        <div className="setup-column">
          <section className="app-card connection-card" aria-labelledby="connection-title">
            <div className="section-heading">
              <span className="step-number">01</span>
              <div>
                <h1 id="connection-title">Подключение</h1>
                <p>Данные инстанса GREEN-API</p>
              </div>
            </div>

            <form className="app-form" onSubmit={checkConnection}>
              <div className="field">
                <label htmlFor="api-url">API URL</label>
                <input
                  id="api-url"
                  type="url"
                  name="apiUrl"
                  placeholder="https://4100.api.green-api.com"
                  value={form.apiUrl}
                  onChange={updateField}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="instance-id">ID инстанса</label>
                <input
                  id="instance-id"
                  name="idInstance"
                  placeholder="Введите ID инстанса"
                  value={form.idInstance}
                  onChange={updateField}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="instance-token">Токен инстанса</label>
                <div className="input-with-action">
                  <input
                    id="instance-token"
                    name="apiTokenInstance"
                    type={showToken ? 'text' : 'password'}
                    placeholder="Введите токен инстанса"
                    value={form.apiTokenInstance}
                    onChange={updateField}
                    required
                  />
                  <button
                    className="input-action"
                    type="button"
                    onClick={() => setShowToken((current) => !current)}
                    aria-label={showToken ? 'Скрыть токен' : 'Показать токен'}
                    aria-pressed={showToken}
                  >
                    {showToken ? 'Скрыть' : 'Показать'}
                  </button>
                </div>
              </div>
              <button className="primary-button" type="submit" disabled={isLoading}>
                {isLoading ? 'Проверяем...' : 'Проверить подключение'}
              </button>
            </form>

            {status && <p className="feedback" role="status">{status}</p>}
          </section>

          <section className="app-card recipient-card" aria-labelledby="recipient-title">
            <div className="section-heading">
              <span className="step-number">02</span>
              <div>
                <h2 id="recipient-title">Найти получателя</h2>
                <p>Введите номер в международном формате.</p>
              </div>
            </div>
            {isConnected ? (
              <>
                <form className="app-form" onSubmit={findRecipient}>
                  <div className="field">
                    <label htmlFor="phone">Номер телефона</label>
                    <input
                      ref={phoneInputRef}
                      type="tel"
                      id="phone"
                      autoComplete="tel"
                      inputMode="tel"
                      required
                    />
                  </div>
                  <button className="primary-button" type="submit">Найти получателя</button>
                </form>
                {recipientStatus && <p className="feedback" role="status">{recipientStatus}</p>}
                {chatId && <p className="chat-id">Идентификатор чата: {chatId}</p>}
              </>
            ) : <p className="step-placeholder">Сначала проверьте подключение.</p>}
          </section>
        </div>

        <section className="app-card responses-card" aria-labelledby="responses-title">
          <div className="section-heading">
            <span className="step-number">03</span>
            <div>
              <h2 id="responses-title">Ответы получателя</h2>
              <p>До 10 последних входящих сообщений.</p>
            </div>
          </div>
          {chatId ? (
            <>
              <button className="primary-button" type="button" onClick={receiveMessage} disabled={isReceiving}>
                {isReceiving ? 'Проверяем...' : 'Проверить ответы'}
              </button>
              {receiveStatus && <p className="feedback" role="status">{receiveStatus}</p>}
              {incomingMessages.length > 0 && (
                <ul className="incoming-messages">
                  {incomingMessages.map((message) => (
                    <li key={message.id}>{message.text}</li>
                  ))}
                </ul>
              )}
            </>
          ) : <p className="step-placeholder">Выберите найденный чат.</p>}
        </section>
        <section className="app-card message-card" aria-labelledby="message-title">
          <div className="section-heading">
            <span className="step-number">04</span>
            <div>
              <h2 id="message-title">Новое сообщение</h2>
              <p>Напишите текст для найденного получателя.</p>
            </div>
          </div>
          {chatId ? (
            <>
              <form className="app-form" onSubmit={sendMessage}>
                <div className="field">
                  <label htmlFor="message">Сообщение</label>
                  <textarea
                    id="message"
                    placeholder="Введите сообщение..."
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    maxLength={4096}
                    required
                  />
                </div>
                <button className="primary-button" type="submit" disabled={isSending}>
                  {isSending ? 'Отправляем...' : 'Отправить сообщение'}
                </button>
              </form>
              {sendStatus && <p className="feedback" role="status">{sendStatus}</p>}
            </>
          ) : <p className="step-placeholder">Выберите найденный чат.</p>}
        </section>
        <aside className="history-card" aria-labelledby="history-title">
          <span className="eyebrow">История</span>
          <h2 id="history-title">Последние чаты</h2>
          <p className="history-description">До 10 найденных чатов этого инстанса. Статус обновляется после проверки ответов.</p>
          {chatHistory.length > 0 ? (
            <ul className="history-list">
              {chatHistory.map((chat) => (
                <li className="history-row" key={chat.chatId}>
                  <button
                    className="history-item"
                    type="button"
                    onClick={() => selectChat(chat.chatId)}
                    aria-pressed={chatId === chat.chatId}
                  >
                    <span className="history-name">{chat.name || 'Имя недоступно'}</span>
                    <span className="history-detail">ID: {chat.chatId}</span>
                    <span className="history-detail">Номер: {chat.phoneNumber ? `+${chat.phoneNumber.replace(/^\+/, '')}` : 'скрыт'}</span>
                    <span className={chat.hasReply ? 'reply-status reply-status--received' : 'reply-status'}>
                      {chat.hasReply ? 'Ответ получен' : chat.lastSentAt ? 'Ожидаем ответ' : 'Сообщение не отправлялось'}
                    </span>
                  </button>
                  <button
                    className="history-remove"
                    type="button"
                    onClick={() => removeChatFromHistory(chat.chatId)}
                    aria-label={`Убрать чат ${chat.name || chat.chatId} из истории`}
                  >
                    Убрать
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="history-empty">
              {isConnected ? 'Найдите получателя, чтобы добавить его в историю.' : 'Подключите инстанс, чтобы увидеть историю.'}
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}

export default App
