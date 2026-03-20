const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

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
  'https://api.node-card.com/api/open/card/redeem',
  params,
  {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }
);

res.json(response.data);

} catch (err) {
res.json({
code: 0,
msg: "خطأ بالسيرفر ❌"
});
}
});

app.listen(process.env.PORT || 3000, () => {
console.log('Server running');
});
