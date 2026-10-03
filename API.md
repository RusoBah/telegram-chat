# Памятка по API

Проект обращается к **GREEN-API для Telegram** через локальный Express-сервер. Браузер вызывает маршруты `/api/...`, а сервер выполняет запросы к GREEN-API. В проекте не используются Telegram Bot API, вебхуки или метод `receiveNotification`: кнопка проверки ответов читает историю выбранного чата методом `getChatHistory`.

## Данные подключения

Для каждого рабочего запроса клиент передаёт серверу:

| Поле | Значение |
| --- | --- |
| `apiUrl` | HTTPS-адрес сервера из кабинета GREEN-API, например `https://4100.api.green-api.com`. |
| `idInstance` | Числовой ID инстанса, передаваемый строкой. |
| `apiTokenInstance` | Токен инстанса. Не помещайте реальный токен в код или документацию. |

Сервер принимает только корневые HTTPS-адреса `api.green-api.com` либо `<число>.api.green-api.com`. Внешний URL строится по схеме:

```text
{apiUrl}/waInstance{idInstance}/{method}/{apiTokenInstance}
```

Запрос к GREEN-API ограничен тайм-аутом 10 секунд. Метод без тела отправляется как `GET`; методы с телом — как `POST` с JSON.

## Маршруты приложения

Во всех `POST`-маршрутах ниже тело содержит три поля подключения из таблицы выше. Ответы приведены в сокращённом виде.

| Маршрут | Дополнительные поля тела | Что делает | Успешный ответ |
| --- | --- | --- | --- |
| `GET /api/health` | Нет | Проверяет работу локального сервера; GREEN-API не вызывается. | `{ "ok": true }` |
| `POST /api/connection/check` | Нет | Вызывает `getStateInstance`. | `{ "stateInstance": "authorized" }` |
| `POST /api/recipient/check` | `phoneNumber`: строка с номером | Вызывает `checkAccount`, затем при найденном аккаунте пытается вызвать `getContactInfo`. | `{ "exist": true, "chatId": "123456789", "phoneNumber": "79991234567", "name": "Имя" }` либо `{ "exist": false, "chatId": null }` |
| `POST /api/messages/send` | `chatId`: строка из цифр; `message`: текст | Вызывает `sendMessage`. | `{ "idMessage": "..." }` |
| `POST /api/messages/receive` | `chatId`: строка из цифр | Вызывает `getChatHistory` с `count: 100`; возвращает входящие сообщения выбранного чата. | `{ "messages": [{ "id": "...", "text": "Привет", "timestamp": 1234567890 }], "incomingChats": [{ "chatId": "123456789", "timestamp": 1234567890 }] }` |

Номер для поиска можно передать со знаком `+`, пробелами, скобками и дефисами. Сервер убирает эти символы и принимает результат длиной 8–15 цифр. Сообщение должно быть непустым и не длиннее 4096 символов. Некорректные входные данные дают HTTP `400` с `{ "error": "..." }`; ошибка внешнего запроса или неожиданный ответ GREEN-API дают HTTP `502`.

## Используемые методы GREEN-API

| Метод | Вызов из проекта | Назначение и существенные поля |
| --- | --- | --- |
| [`getStateInstance`](https://green-api.com/telegram/docs/api/account/GetStateInstance/) | `GET` | Возвращает `stateInstance`. Интерфейс продолжает работу при `authorized`; также возможны `notAuthorized`, `starting`, `pendingPassword`, `suspended`, `blocked`. |
| [`checkAccount`](https://green-api.com/telegram/docs/api/service/CheckAccount/) | `POST { "phoneNumber": 79991234567 }` | Ищет Telegram-аккаунт по номеру. Возвращает `exist` и, если аккаунт найден, `chatId`. Скрытый настройками Telegram номер может не найтись. |
| [`getContactInfo`](https://green-api.com/telegram/docs/api/service/GetContactInfo/) | `POST { "chatId": "123456789" }` | Дополняет найденный чат именем (`name` или `contactName`) и номером (`phoneNumber`), если они доступны. Сбой этого метода не отменяет успешный поиск аккаунта. |
| [`sendMessage`](https://green-api.com/telegram/docs/api/sending/SendMessage/) | `POST { "chatId": "123456789", "message": "Привет" }` | Ставит текстовое сообщение в очередь отправки и возвращает `idMessage`. Ответ не доказывает доставку адресату. |
| [`getChatHistory`](https://green-api.com/telegram/docs/api/journals/GetChatHistory/) | `POST { "chatId": "123456789", "count": 100 }` | Возвращает до 100 записей истории выбранного чата. Сервер отбирает записи `type: "incoming"` с нужным `chatId`, сортирует по `timestamp` и оставляет последние 10. |

При обработке истории текст берётся из `textMessage`, затем из `caption`; для известных типов вложений без подписи показывается название типа (изображение, видео, документ, аудио, опрос или геопозиция). `incomingChats` содержит только выбранный чат и время его последнего найденного входящего сообщения либо пустой массив. Клиент использует это время для отметки ответа в своей локальной истории.

История чатов в интерфейсе — список до 10 ранее найденных через форму получателей в `localStorage`, а не список всех чатов инстанса GREEN-API. Проверка ответов выполняется по нажатию кнопки для одного выбранного чата.

Реализация запросов находится в [`server/index.js`](server/index.js), обработка сообщений — в [`server/incoming-messages.js`](server/incoming-messages.js), вызовы локальных маршрутов — в [`client/src/App.jsx`](client/src/App.jsx).
