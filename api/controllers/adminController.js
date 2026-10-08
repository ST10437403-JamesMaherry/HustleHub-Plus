
const mongoose = require('mongoose');

const User = require('../models/User');
const Booking = require('../models/Booking');
const Gig = require('../models/Gig');

// Return a restricted list of user details for administration.
const getAdminUsers = async (req, res, next) => {
  try {
    const users = await User.find()
      .select('_id fullName email role createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Explicitly map safe fields rather than returning database documents.
    const safeUsers = users.map((user) => ({
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt
    }));

    return res.status(200).json({
      users: safeUsers
    });
  } catch (error) {
    return next(error);
  }
};

// Return booking records without exposing unrelated account information.
const getAdminBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find()
      .select('_id gig client freelancer amount status createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const safeBookings = bookings.map((booking) => ({
      id: booking._id.toString(),
      gig: booking.gig.toString(),
      client: booking.client.toString(),
      freelancer: booking.freelancer.toString(),
      amount: booking.amount,
      status: booking.status,
      createdAt: booking.createdAt
    }));

    return res.status(200).json({
      bookings: safeBookings
    });
  } catch (error) {
    return next(error);
  }
};

// Allow an administrator to remove a gig regardless of its owner.
const deleteAdminGig = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate the identifier before passing it to Mongoose.
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Invalid gig ID'
      });
    }

    const gig = await Gig.findByIdAndDelete(id);

    if (!gig) {
      return res.status(404).json({
        error: 'Gig not found'
      });
    }

    // Preserve existing booking and transaction history.
    return res.status(200).json({
      message: 'Gig removed successfully'
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAdminUsers,
  getAdminBookings,
  deleteAdminGig
};
