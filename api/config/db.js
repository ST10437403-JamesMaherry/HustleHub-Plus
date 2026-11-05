const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const eventLogger = require('../utils/logger');

// Establish the database connection and replay-protection index before serving requests.
const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    eventLogger.logEvent('database.ready', 'failure', { phase: 'configuration' });
    throw new Error('MONGO_URI is not configured');
  }

  let phase = 'connection';

  try {
    await mongoose.connect(mongoUri);

    // Requests must not start before the unique booking index is ready.
    phase = 'indexes';
    await Booking.createIndexes();

    eventLogger.logEvent('database.ready', 'success', { phase });
  } catch (error) {
    eventLogger.logEvent('database.ready', 'failure', { phase, error });
    throw error;
  }
};

module.exports = connectDB;
