require('dotenv').config({ override: true });

const app = require('./app');

const port = process.env.PORT || 4000;

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

app.listen(port, () => {
  console.log(`Wallet backend listening on port ${port}`);
});
