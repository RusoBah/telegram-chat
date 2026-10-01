import express from 'express';

const app = express();

app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({ok: true});
});

app.listen(3001, () => {
  console.log('API запущен: http://localhost:3001');
});