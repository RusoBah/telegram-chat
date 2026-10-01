import { useState } from 'react';


function App() {
  const [status, setStatus] = useState('Проверка ещё не запускалась');

  async function checkServer() {
    setStatus('Проверка..');

    try {
      const response = await fetch('/api/health');

      if (!response.ok) {
        throw new Error(`Ошибка HTTP: ${response.status}`);
      }

      const data = await response.json();
      setStatus(data.ok ? 'Сервер гуд' : 'Нежданчик');
    } catch {
      setStatus(`Не удалось подключиться: ${error.message}`);
    }
  }
 
  return (
    <main>
      <h1>Telegram Chat</h1>
      <button onClick={checkServer}>Проверить сервер</button>
      <p>{status}</p>
    </main>
  );
}

export default App
