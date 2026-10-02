import { useState } from 'react';

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

  /** Разрешает показать поиск получателя после авторизации инстанса. */
  const [isConnected, setIsConnected] = useState(false);

  /** Номер получателя, введённый пользователем. */
  const [phoneNumber, setPhoneNumber] = useState('');

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
      const response = await fetch('/api/recipient/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, phoneNumber }),
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

  return (
    <main>
      <h1>Telegram Chat</h1>

      
      <form onSubmit={checkConnection}>
        <label>
          API URL
          <input
            type="url"
            name="apiUrl"
            placeholder="https://4100.api.green-api.com"
            value={form.apiUrl}
            onChange={updateField}
            required
          />
        </label>
        <label>
          ID инстанса
          <input
            name="idInstance"
            value={form.idInstance}
            onChange={updateField}
            required
          />
        </label>

        <label>
          Токен инстанса
          <input
            name="apiTokenInstance"
            type="password"
            value={form.apiTokenInstance}
            onChange={updateField}
            required
          />
        </label>

        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Проверяем...' : 'Проверить подключение'}
        </button>
      </form>

      <p role="status">
        {status}
      </p>

      {/** Доступен поиск после авторизации  */}
      {isConnected && (
        <section>
          <h2>Найти получателя</h2>

          <form onSubmit={findRecipient}>
            <label>
              Телефон в международном формате
              <input
                type="tel"
                placeholder="+79991234567"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                required
              />
            </label>

            <button type="submit">Найти</button>
          </form>

          <p role="status">{recipientStatus}</p>
          {chatId && <p>Идентификатор чата: {chatId}</p>}
        </section>
      )}
    </main>
  );
}

export default App
