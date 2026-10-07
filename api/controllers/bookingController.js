const mongoose = require('mongoose');

const Gig = require('../models/Gig');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');

// Return only booking fields required by API consumers.
const toBookingResponse = (booking) => {
  return {
    id: booking.id,
    gig: booking.gig,
    client: booking.client,
    freelancer: booking.freelancer,
    amount: booking.amount,
    status: booking.status,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt
  };
};

// Return only the simulated transaction information required by the client.
const toTransactionResponse = (transaction) => {
  return {
    id: transaction.id,
    booking: transaction.booking,
    client: transaction.client,
    freelancer: transaction.freelancer,
    amount: transaction.amount,
    status: transaction.status,
    createdAt: transaction.createdAt
  };
};

/**
 * Creates a client booking and its associated simulated transaction.
 */
const createBooking = async (req, res, next) => {
  let session;

  try {
    session = await mongoose.startSession();

    let gig = null;
    let booking = null;
    let transaction = null;

    // Keep the booking and transaction atomic so partial financial records
    // are not stored if either database operation fails.
    await session.withTransaction(async () => {
      gig = await Gig.findOne({
        _id: req.body.gigId,
        active: true
      }).session(session);

      if (!gig) {
        return;
      }

      // Ownership and pricing are always derived server-side.
      [booking] = await Booking.create(
        [
          {
            gig: gig._id,
            client: req.auth.id,
            freelancer: gig.freelancer,
            amount: gig.price,
            status: 'confirmed'
          }
        ],
        {
          session
        }
      );

      [transaction] = await Transaction.create(
        [
          {
            booking: booking._id,
            client: req.auth.id,
            freelancer: gig.freelancer,
            amount: gig.price,
            status: 'confirmed'
          }
        ],
        {
          session
        }
      );
    });

    if (!gig) {
      return res.status(404).json({
        error: 'Gig not found or unavailable'
      });
    }

    if (!booking || !transaction) {
      throw new Error(
        'Booking transaction was not completed'
      );
    }

    return res.status(201).json({
      message:
        'Booking confirmed and simulated transaction recorded',
      booking: toBookingResponse(booking),
      transaction: toTransactionResponse(transaction)
    });
  } catch (error) {
    return next(error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

/**
 * Returns bookings belonging to the authenticated client.
 */
const getMyBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({
      client: req.auth.id
    }).sort({
      createdAt: -1
    });

    return res.status(200).json({
      bookings: bookings.map(toBookingResponse)
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Returns bookings associated with the authenticated freelancer.
 */
const getFreelancerBookings = async (req, res, next) => {
  try {
    // Ownership is enforced using the verified freelancer ID from the JWT.
    const bookings = await Booking.find({
      freelancer: req.auth.id
    }).sort({
      createdAt: -1
    });

    return res.status(200).json({
      bookings: bookings.map(toBookingResponse)
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Returns one booking only when it belongs to the authenticated client.
 */
const getBookingById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'Invalid booking ID'
      });
    }

    // Include ownership in the database query so another client's booking
    // is never returned or disclosed by this endpoint.
    const booking = await Booking.findOne({
      _id: req.params.id,
      client: req.auth.id
    });

    if (!booking) {
      return res.status(404).json({
        error: 'Booking not found'
      });
    }

    return res.status(200).json({
      booking: toBookingResponse(booking)
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createBooking,
  getMyBookings,
  getFreelancerBookings,
  getBookingById
};