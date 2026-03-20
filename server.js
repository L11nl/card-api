const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const API = 'https://api.node-card.com';

// الصفحة الرئيسية
app.get('/', (req, res) => {
res.send('API شغال 🔥');
});

// استبدال بطاقة
app.post('/redeem', async (req, res) => {
try {
const { card_key } = req.body;

const params = new URLSearchParams();
params.append('card_key', card_key);
params.append('merchant_dict_id', 1);
params.append('platform_id', 1);

const response = await axios.post(
  API + '/api/open/card/redeem',
  params,
  { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
);

res.json(response.data);

} catch {
res.json({ code: 0, msg: "خطأ بالسيرفر ❌" });
}
});

// حالة البطاقة
app.post('/status', async (req, res) => {
try {
const { card_key } = req.body;

const params = new URLSearchParams();
params.append('card_key', card_key);

const response = await axios.post(
  API + '/api/open/card/status',
  params,
  { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
);

res.json(response.data);

} catch {
res.json({ code: 0, msg: "خطأ ❌" });
}
});

// العمليات
app.post('/transactions', async (req, res) => {
try {
const { card_key } = req.body;

const params = new URLSearchParams();
params.append('card_key', card_key);

const response = await axios.post(
  API + '/api/open/card/transactions',
  params,
  { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
);

res.json(response.data);

} catch {
res.json({ code: 0, msg: "خطأ ❌" });
}
});

// التجار
app.get('/merchants', async (req, res) => {
try {
const response = await axios.post(
API + '/api/open/merchant/list',
{},
{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
);

res.json(response.data);

} catch {
res.json({ code: 0, msg: "خطأ ❌" });
}
});

// المنصات
app.get('/capacity', async (req, res) => {
try {
const response = await axios.get(
API + '/api/open/platform/capacity'
);

res.json(response.data);

} catch {
res.json({ code: 0, msg: "خطأ ❌" });
}
});

app.listen(process.env.PORT || 3000);
