const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const BASE = 'https://api.node-card.com';

app.post('/redeem', async (req, res) => {
  try {
    const r = await axios.post(
      BASE + '/api/open/card/redeem',
      new URLSearchParams(req.body),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    res.json(r.data);
  } catch {
    res.json({ code: 0, msg: 'error' });
  }
});

app.get('/', (req, res) => {
  res.send('API شغال 🔥');
});

app.listen(3000);
