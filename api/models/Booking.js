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
    },
    requestKey: {
      type: String,
      immutable: true,
      minlength: 36,
      maxlength: 36
    }
  },
  {
    timestamps: true
  }
);

// The partial unique index preserves bookings created before request keys existed.
bookingSchema.index(
  { client: 1, requestKey: 1 },
  {
    name: 'unique_client_booking_request',
    unique: true,
    partialFilterExpression: { requestKey: { $type: 'string' } }
  }
);

module.exports = mongoose.model('Booking', bookingSchema);
