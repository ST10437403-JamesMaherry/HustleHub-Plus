const mongoose = require('mongoose');

// Establish the database connection before the API begins accepting requests.
const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  // Fail during startup rather than running without the required database.
  if (!mongoUri) {
    throw new Error('MONGO_URI is not configured');
  }

  await mongoose.connect(mongoUri);

  console.log('MongoDB connected');
};

module.exports = connectDB;
