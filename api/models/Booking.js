const mongoose = require('mongoose');

const BOOKING_STATUSES = [
  'confirmed',
  'cancelled'
];

const bookingSchema = new mongoose.Schema(
  {
    gig: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gig',
      required: true,
      index: true
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
      enum: BOOKING_STATUSES,
      default: 'confirmed'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Booking', bookingSchema);