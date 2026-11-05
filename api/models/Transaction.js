const mongoose = require('mongoose');

const TRANSACTION_STATUSES = [
  'confirmed',
  'cancelled'
];

const transactionSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    unique: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  freelancer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  status: {
    type: String,
    required: true,
    enum: TRANSACTION_STATUSES,
    default: 'confirmed'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
});

// Support freelancer-scoped confirmed income and tax-year date queries.
transactionSchema.index({ freelancer: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model(
  'Transaction',
  transactionSchema
);
