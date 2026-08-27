require('dotenv').config();

const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');

const authRoutes = require('./routes/authRoutes');

const app = express();

const PORT = Number(process.env.PORT) || 4000;
const APP_NAME = process.env.APP_NAME || 'HustleHubPlusAPI';
const USE_HTTPS = process.env.USE_HTTPS === 'true';

// Parse incoming JSON request bodies.
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
    app: APP_NAME,
    protocol: USE_HTTPS ? 'HTTPS' : 'HTTP'
  });
});

// Authentication endpoints.
app.use('/api/auth', authRoutes);

if (USE_HTTPS) {
  // Resolve the local certificate paths from environment configuration.
  const keyPath = path.resolve(
    __dirname,
    process.env.SSL_KEY_PATH || './certs/localhost-key.pem'
  );

  const certPath = path.resolve(
    __dirname,
    process.env.SSL_CERT_PATH || './certs/localhost-cert.pem'
  );

  // Load the local private key and certificate.
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };

  // Run the Express application through an HTTPS server.
  https.createServer(httpsOptions, app).listen(PORT, () => {
    console.log(
      `${APP_NAME} HTTPS server running on port ${PORT}`
    );
  });
} else {
  // HTTP remains available only for local troubleshooting.
  app.listen(PORT, () => {
    console.log(
      `${APP_NAME} HTTP server running on port ${PORT}`
    );
  });
}