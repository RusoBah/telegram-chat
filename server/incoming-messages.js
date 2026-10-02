const messageLabels = {
  imageMessage: 'Изображение',
  videoMessage: 'Видео',
  documentMessage: 'Документ',
  audioMessage: 'Аудиосообщение',
  pollMessage: 'Опрос',
  locationMessage: 'Геопозиция',
};

export function getIncomingMessages(history, chatId) {
  return history
    .filter((entry) => entry?.type === 'incoming'
      && entry.chatId === chatId
      && typeof entry.idMessage === 'string')
    .map((entry) => ({
      id: entry.idMessage,
      text: typeof entry.textMessage === 'string' && entry.textMessage
        ? entry.textMessage
        : typeof entry.caption === 'string' && entry.caption
          ? entry.caption
          : messageLabels[entry.typeMessage] ?? 'Получено сообщение',
      timestamp: Number.isInteger(entry.timestamp) ? entry.timestamp : 0,
    }))
    .sort((first, second) => first.timestamp - second.timestamp);
}
