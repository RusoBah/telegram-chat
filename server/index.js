import express from 'express';

const app = express();
app.disable('x-powered-by');

app.use(express.json());

app.get('/api/connection/check', async (req, res) => {
    const { apiUrl, idInstance, apiTokenInstance } = req.body ?? {};

    if (
        typeof apiUrl !== 'string' ||
        typeof idInstance !== 'string' ||
        typeof apiTokenInstance !== 'string' ||
        !/^\d+$/.test(idInstance) ||
        !/^[a-zA-Z0-9_-]+$/.test(apiTokenInstance)
    ) {
        return res.status(400).json({ error: 'Проверьте параметры подключения' });
    }

    let baseUrl;

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
            throw new Error('Некорректный адрес API');
        }

        baseUrl = url.origin;
    } catch {
        return res.status(400).json({ error: 'Укажите корректный apiUrl GREEN-API' });
    }

    try {
        const response = await fetch(
            `${baseUrl}/waInstance${idInstance}/getStateInstance/${apiTokenInstance}`,
            { signal: AbortSignal.timeout(10000) },
        );

        if (!response.ok) {
            return res.status(502).json({
                error: `GREEN-API ответил HTTP ${response.status}. Проверьте параметры инстанса`,
            });
        }

        const data = await response.json();

        if (typeof data.stateInstance !== 'string') {
            return res.status(502).json({ error: 'Неожиданный ответ GREEN-API' });
        }

        return res.json({ stateInstance: data.stateInstance });
    } catch {
        return res.status(502).json({
            error: 'Не удалось связаться с GREEN-API',
        });
    }

});

app.listen(3001, () => {
    console.log('API запущен: http://localhost:3001');
});