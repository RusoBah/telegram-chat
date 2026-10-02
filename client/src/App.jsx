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
  const [form, setForm] = useState({
    apiUrl: '',
    idInstance: '',
    apiTokenInstance: '',
  });
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const updateField = (event) => {
    const {name, value} = event.target;

    setForm((current) => ({
      ...current,
      [name]:value,
    }));
  } 


  const checkConnection = async (event) => {
    event.preventDefault();
    setIsLoading(true);
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
    </main>
  );
}

export default App
