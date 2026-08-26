require('dotenv').config();

const express = require('express');

const app = express();

const PORT = Number(process.env.PORT) || 4000;
const APP_NAME = process.env.APP_NAME || 'HustleHubPlusAPI';

// Parse incoming JSON requests.
app.use(express.json());

// Basic API information route.
app.get('/', (req, res) => {
  res.status(200).json({
    app: APP_NAME,
    message: 'HustleHub+ API is running'
  });
});

// Health-check endpoint.
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    app: APP_NAME
  });
});

app.listen(PORT, () => {
  console.log(`${APP_NAME} running on port ${PORT}`);
});