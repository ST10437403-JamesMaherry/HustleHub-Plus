const mongoose = require('mongoose');

const gigSchema = new mongoose.Schema(
  {
    freelancer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1000
    },
    category: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50
    },
    price: {
      type: Number,
      required: true,
      min: 0.01
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Gig', gigSchema);