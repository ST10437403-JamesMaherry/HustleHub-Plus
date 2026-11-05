const mongoose = require('mongoose');
const Booking = require('../models/Booking');

// Establish the database connection and replay-protection index before serving requests.
const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is not configured');
  }

  await mongoose.connect(mongoUri);

  // A missing unique index would allow competing requests to create duplicates.
  await Booking.createIndexes();

  console.log('MongoDB connected and booking indexes ready');
};

module.exports = connectDB;
