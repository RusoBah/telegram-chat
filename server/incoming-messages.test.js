import assert from 'node:assert/strict';
import test from 'node:test';
import { getIncomingMessages } from './incoming-messages.js';

test('shows incoming replies from the selected chat in chronological order', () => {
  const history = [
    { type: 'incoming', chatId: '42', idMessage: 'reply', timestamp: 12, typeMessage: 'textMessage', textMessage: 'Ответ' },
    { type: 'outgoing', chatId: '42', idMessage: 'sent', timestamp: 11, textMessage: 'Вопрос' },
    { type: 'incoming', chatId: '17', idMessage: 'other', timestamp: 13, textMessage: 'Другой чат' },
    { type: 'incoming', chatId: '42', idMessage: 'photo', timestamp: 10, typeMessage: 'imageMessage' },
  ];

  assert.deepEqual(getIncomingMessages(history, '42'), [
    { id: 'photo', text: 'Изображение', timestamp: 10 },
    { id: 'reply', text: 'Ответ', timestamp: 12 },
  ]);
});
