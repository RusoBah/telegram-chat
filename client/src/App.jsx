import { useEffect, useRef, useState } from 'react';
import intlTelInput from 'intl-tel-input';
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

  /** Номер получателя, введённый пользователем. */
  const [phoneNumber, setPhoneNumber] = useState('');
  const phoneInputRef = useRef(null);
  const phoneItiRef = useRef(null);

  useEffect(() => {
    const input = phoneInputRef.current;
    if (!input) return undefined;

    const initialCountryLookup = async () => {
      const response = await fetch('https://ipapi.co/json');
      if (!response.ok) throw new Error('Не удалось определить страну по IP');
      const data = await response.json();
      return data.country_code;
    };

    const iti = intlTelInput(input, {
      initialCountryLookup,
      countrySearch: false,
      matchDropdownWidth: false,
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

  /**
   * 
   * Отправляет параметры инстанса серверу и показывает его состояние.
   */
  const checkConnection = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setIsConnected(false);
    setChatId(null);
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
      setIsConnected(data.stateInstance === 'authorized');

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
    setRecipientStatus('Ищем получателя...');

    try {
      await phoneItiRef.current?.promise;
      const internationalNumber = phoneItiRef.current?.getNumber() || phoneInputRef.current?.value || phoneNumber;
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
    } catch (error) {
      setSendStatus(error.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="page">
      <div className="app-card">
        <header className="card-header">
          <span className="eyebrow">Telegram Chat</span>
          <h1>Подключите ваш чат</h1>
          <p>Укажите данные инстанса, чтобы начать переписку.</p>
        </header>

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

        {isConnected && (
          <section className="next-section" aria-labelledby="recipient-title">
            <div className="section-heading">
              <span className="step-number">02</span>
              <div>
                <h2 id="recipient-title">Найти получателя</h2>
                <p>Введите номер в международном формате.</p>
              </div>
            </div>
            <form className="app-form" onSubmit={findRecipient}>
              <div className="field">
                <label htmlFor="phone">Номер телефона</label>
                <input
                  ref={phoneInputRef}
                  type="tel"
                  id="phone"
                  autoComplete="tel"
                  placeholder="+1 702 123 4567"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  required
                />
              </div>
              <button className="primary-button" type="submit">Найти получателя</button>
            </form>
            {recipientStatus && <p className="feedback" role="status">{recipientStatus}</p>}
            {chatId && <p className="chat-id">Идентификатор чата: {chatId}</p>}
          </section>
        )}

        {chatId && (
          <section className="next-section" aria-labelledby="message-title">
            <div className="section-heading">
              <span className="step-number">03</span>
              <div>
                <h2 id="message-title">Новое сообщение</h2>
                <p>Напишите текст для найденного получателя.</p>
              </div>
            </div>
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
          </section>
        )}
      </div>
    </main>
  );
}

export default App
