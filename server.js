const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

app.post('/redeem', async (req, res) => {
try {
const { card_key } = req.body;

const params = new URLSearchParams();
params.append('card_key', card_key);

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
msg: "خطأ بالسيرفر"
});
}
});

app.listen(3000, () => console.log('Server running'));
