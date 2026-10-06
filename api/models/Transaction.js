const mongoose = require('mongoose');

const TRANSACTION_STATUSES = [
  'confirmed',
  'cancelled'
];

const transactionSchema = new mongoose.Schema(
  {
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
      enum: TRANSACTION_STATUSES,
      default: 'confirmed'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  'Transaction',
  transactionSchema
);