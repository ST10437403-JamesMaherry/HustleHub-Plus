require('dotenv').config();

const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');

const eventLogger = require('./utils/logger');
const { requestContext } = require('./middleware/requestContext');

const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const gigRoutes = require('./routes/gigRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const incomeRoutes = require('./routes/incomeRoutes');
const adminRoutes = require('./routes/adminRoutes');

const {
  notFoundHandler,
  errorHandler
} = require('./middleware/errorHandler');

const app = express();

const PORT = Number(process.env.PORT) || 4000;
const APP_NAME = process.env.APP_NAME || 'HustleHubPlusAPI';
const USE_HTTPS = process.env.USE_HTTPS === 'true';

// Read the permitted frontend origin from the environment.
const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Generate a server-owned correlation ID before request processing.
app.use(requestContext);

// Hide the Express implementation detail from responses.
app.disable('x-powered-by');

// Apply security-related HTTP headers.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", CLIENT_ORIGIN],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginResourcePolicy: {
      policy: 'same-site'
    }
  })
);

// Only allow browser requests from the configured frontend origin.
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    methods: [
      'GET',
      'POST',
      'PUT',
      'DELETE'
    ],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    // Lets the React client tell users how long a rate limit lasts.
    exposedHeaders: ['Retry-After', 'X-Request-ID']
  })
);

// Limit JSON request bodies to reduce oversized-payload abuse.
app.use(express.json({ limit: '10kb' }));

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

// Marketplace Gig endpoints.
app.use('/api/gigs', gigRoutes);

// Booking endpoints.
app.use('/api/bookings', bookingRoutes);

// Income endpoints.
app.use('/api/income', incomeRoutes);

// Administration endpoints.
app.use('/api/admin', adminRoutes);

// Handle requests that do not match any defined route.
app.use(notFoundHandler);

// Central error-handling middleware.
app.use(errorHandler);

// Start the application only after the database connection succeeds.
const startServer = async () => {
  try {
    await connectDB();

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
        eventLogger.logEvent('app.start', 'success', { phase: 'https' });
      });

      return;
    }

    // HTTP remains available only for local troubleshooting.
    app.listen(PORT, () => {
      eventLogger.logEvent('app.start', 'success', { phase: 'http' });
    });
  } catch (error) {
    // A missing database connection prevents a safe application startup.
    eventLogger.logEvent('app.start', 'failure', { error });

    process.exit(1);
  }
};

startServer();
