import express from 'express';

const app = express();

app.disable('x-powered-by');
app.use(express.json());

/** Входящие сообщения текущего запуска сервера: ключ инстанса -> сообщения чатов. */
const inbox = new Map();

/**
 * Сохраняет входящее текстовое сообщение без дублирования по idMessage.
 */
function saveIncomingMessage(connection, body) {
  if (
    body?.typeWebhook !== 'incomingMessageReceived' ||
    body?.messageData?.typeMessage !== 'textMessage' ||
    typeof body.idMessage !== 'string' ||
    typeof body.senderData?.chatId !== 'string' ||
    typeof body.messageData?.textMessageData?.textMessage !== 'string'
  ) {
    return;
  }

  const instanceKey = `${connection.baseUrl}:${connection.idInstance}`;
  const chats = inbox.get(instanceKey) ?? new Map();
  const chatId = body.senderData.chatId;
  const messages = chats.get(chatId) ?? [];

  if (!messages.some((item) => item.id === body.idMessage)) {
    messages.push({
      id: body.idMessage,
      text: body.messageData.textMessageData.textMessage,  
      timestamp: body.timestamp,
    });
  }

  chats.set(chatId, messages);
  inbox.set(instanceKey, chats);
}

/**
 * Проверяет параметры подключения и возвращает данные для запросов к GREEN-API.
 *
 * Разрешает только HTTPS-адрес API GREEN-API. При некорректных параметрах
 * возвращает null, чтобы маршрут мог ответить пользователю ошибкой 400.
 *
 * @param {object} [credentials={}] Параметры из тела запроса.
 * @param {unknown} [credentials.apiUrl] Адрес API из кабинета GREEN-API.
 * @param {unknown} [credentials.idInstance] Идентификатор инстанса.
 * @param {unknown} [credentials.apiTokenInstance] Токен инстанса.
 * @returns {{baseUrl: string, idInstance: string, apiTokenInstance: string} | null}
 */
function parseConnection({ apiUrl, idInstance, apiTokenInstance } = {}) {
  if (
    typeof apiUrl !== 'string' ||
    typeof idInstance !== 'string' ||
    typeof apiTokenInstance !== 'string' ||
    !/^\d+$/.test(idInstance) ||
    !/^[a-zA-Z0-9_-]+$/.test(apiTokenInstance)
  ) {
    return null;
  }

  try {
    const url = new URL(apiUrl.trim());

    if (
      url.protocol !== 'https:' ||
      !/^(?:\d+\.)?api\.green-api\.com$/.test(url.hostname) ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return {
      baseUrl: url.origin,
      idInstance,
      apiTokenInstance,
    };
  } catch {
    return null;
  }
}

/**
 * Выполняет запрос к методу GREEN-API.
 *
 * Без payload отправляет GET-запрос. С payload отправляет POST-запрос
 * с JSON в теле. При неуспешном HTTP-ответе выбрасывает ошибку.
 *
 * @param {{baseUrl: string, idInstance: string, apiTokenInstance: string}} connection
 *   Проверенные параметры подключения.
 * @param {string} method Название метода GREEN-API.
 * @param {object} [payload] Данные для POST-запроса.
 * @returns {Promise<any>} JSON-ответ GREEN-API.
 * @throws {Error} Если GREEN-API вернул неуспешный HTTP-статус.
 */
async function callGreenApi(connection, method, payload) {
  const { baseUrl, idInstance, apiTokenInstance } = connection;

  const response = await fetch(
    `${baseUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}`,
    {
      method: payload === undefined ? 'GET' : 'POST',
      headers:
        payload === undefined
          ? undefined
          : { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!response.ok) {
    throw new Error(`GREEN-API ответил HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Отправляет клиенту ошибку при неудачном обращении к GREEN-API.
 *
 * Ошибку HTTP передаёт в понятном виде. Подробности сетевых ошибок
 * не возвращает клиенту.
 *
 * @param {import('express').Response} res Ответ Express.
 * @param {Error} error Возникшая ошибка.
 * @returns {import('express').Response}
 */
function sendApiError(res, error) {
  const message = error.message.startsWith('GREEN-API ответил HTTP')
    ? error.message
    : 'Не удалось связаться с GREEN-API';

  return res.status(502).json({ error: message });
}

/**
 * Проверяет, что наш Express-сервер запущен и отвечает.
 *
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});


/**
 * Проверяет состояние Telegram-инстанса через GREEN-API.
 *
 * POST /api/connection/check
 * Тело: apiUrl, idInstance, apiTokenInstance.
 * Ответ: stateInstance, например "authorized".
 */
app.post('/api/connection/check', async (req, res) => {
  const connection = parseConnection(req.body);

  if (!connection) {
    return res.status(400).json({ error: 'Проверьте параметры подключения' });
  }

  try {
    const data = await callGreenApi(connection, 'getStateInstance');

    if (typeof data.stateInstance !== 'string') {
      return res.status(502).json({ error: 'Неожиданный ответ GREEN-API' });
    }

    return res.json({ stateInstance: data.stateInstance });
  } catch (error) {
    return sendApiError(res, error);
  }
});

/**
 * Передаёт текстовое сообщение в очередь отправки GREEN-API.
 *
 * POST /api/messages/send
 * Тело: параметры подключения, chatId и message.
 */
app.post('/api/messages/send', async (req, res) => {
  const connection = parseConnection(req.body);
  const { chatId, message } = req.body ?? {};

  if (!connection) {
    return res.status(400).json({ error: 'Проверьте параметры подключения' });
  }

  if (typeof chatId !== 'string' || !/^\d+$/.test(chatId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор чата' });
  }

  if (
    typeof message !== 'string' ||
    !message.trim() ||
    message.length > 4096
  ) {
    return res.status(400).json({
      error: 'Введите сообщение длиной до 4096 символов',
    });
  }

  try {
    const data = await callGreenApi(connection, 'sendMessage', {
      chatId,
      message: message.trim(),
    });

    if (typeof data.idMessage !== 'string') {
      return res.status(502).json({ error: 'Неожиданный ответ GREEN-API' });
    }

    return res.json({ idMessage: data.idMessage });
  } catch (error) {
    return sendApiError(res, error);
  }
});

/**
 * Ищет Telegram-аккаунт получателя по номеру телефона.
 *
 * POST /api/recipient/check
 * Тело: параметры подключения и phoneNumber.
 * Ответ: exist и chatId, если аккаунт найден.
 */
app.post('/api/recipient/check', async (req, res) => {
  const connection = parseConnection(req.body);
  const phoneNumber = req.body?.phoneNumber;

  if (!connection) {
    return res.status(400).json({ error: 'Проверьте параметры подключения' });
  }

  if (typeof phoneNumber !== 'string') {
    return res.status(400).json({ error: 'Укажите номер телефона' });
  }

  /**
  * Убираем только символы оформления номера: +, пробелы, скобки и дефисы.
  * Буквы и другие символы остаются и не пройдут проверку ниже.
  */
  const digits = phoneNumber.replace(/[\s()+-]/g, '');

  if (!/^\d{8,15}$/.test(digits)) {
    return res.status(400).json({
      error: 'Введите номер в международном формате, например +79991234567',
    });
  }

  try {
    const data = await callGreenApi(connection, 'checkAccount', {
      phoneNumber: Number(digits),
    });

    if (data.exist === false) {
      return res.json({ exist: false, chatId: null });
    }

    if (data.exist !== true || typeof data.chatId !== 'string') {
      return res.status(502).json({ error: 'Неожиданный ответ GREEN-API' });
    }

    let name = '';
    let resolvedPhoneNumber = digits;

    try {
      const contact = await callGreenApi(connection, 'getContactInfo', {
        chatId: data.chatId,
      });
      name = [contact.name, contact.contactName].find(
        (value) => typeof value === 'string' && value.trim(),
      )?.trim() ?? '';
      if (typeof contact.phoneNumber === 'number' && contact.phoneNumber > 0) {
        resolvedPhoneNumber = String(contact.phoneNumber);
      }
    } catch {
      // Поиск получателя остаётся успешным, даже если имя недоступно.
    }

    return res.json({
      exist: true,
      chatId: data.chatId,
      phoneNumber: resolvedPhoneNumber,
      name,
    });
  } catch (error) {
    return sendApiError(res, error);
  }
});

/**
 * Забирает до десяти уведомлений из очереди и возвращает ответы нужного чата.
 *
 * POST /api/messages/receive
 * Тело: параметры подключения и chatId.
 */
app.post('/api/messages/receive', async (req, res) => {
  const connection = parseConnection(req.body);
  const chatId = req.body?.chatId;

  if (!connection || typeof chatId !== 'string' || !/^\d+$/.test(chatId)) {
    return res.status(400).json({ error: 'Проверьте подключение и чат' });
  }

  try {
    for (let i = 0; i < 10; i += 1) {
      const notification = await callGreenApi(
        connection,
        'receiveNotification',
      );

      /** Пустой ответ означает, что сейчас в очереди ничего нет. */
      if (!notification) {
        break;
      }

      if (!Number.isInteger(notification.receiptId)) {
        return res.status(502).json({ error: 'Некорректное уведомление' });
      }

      /** Сначала сохраняем сообщение, затем подтверждаем обработку. */
      saveIncomingMessage(connection, notification.body);

      const { baseUrl, idInstance, apiTokenInstance } = connection;

      const deleteResponse = await fetch(
        `${baseUrl}/waInstance${idInstance}/deleteNotification/${apiTokenInstance}/${notification.receiptId}`,
        {
          method: 'DELETE',
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!deleteResponse.ok) {
        throw new Error(`GREEN-API ответил HTTP ${deleteResponse.status}`);
      }

      const result = await deleteResponse.json();

      if (result.result !== true) {
        throw new Error('GREEN-API не подтвердил обработку уведомления');
      }
    }

    const instanceKey = `${connection.baseUrl}:${connection.idInstance}`;
    const messages = inbox.get(instanceKey)?.get(chatId) ?? [];

    return res.json({ messages });
  } catch (error) {
    return sendApiError(res, error);
  }
});

app.listen(3001, () => {
  console.log('API запущен: http://localhost:3001');
});