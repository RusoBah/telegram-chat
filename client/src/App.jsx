import { useEffect, useRef, useState } from 'react';
import intlTelInput from 'intl-tel-input';
import 'intl-tel-input/styles';

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
                ref={phoneInputRef}
                type="tel"
                id="phone"
                autoComplete="tel"
                placeholder="+1 702 123 4567"
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
