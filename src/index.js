// require('dotenv').config({ path: '.env.local' });

const app = require('./app');

const port = process.env.PORT || 225;
app.listen(port, () => {
  /* eslint-disable no-console */
  console.log(`Listening: http://localhost:${port}`);
  /* eslint-enable no-console */
});
