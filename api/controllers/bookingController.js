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

// Return only simulated transaction information required by the client.
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

// Retrieve a committed booking and its transaction by client-scoped request key.
const findExistingRequest = async (clientId, requestKey) => {
  const booking = await Booking.findOne({ client: clientId, requestKey });

  if (!booking) {
    return null;
  }

  const transaction = await Transaction.findOne({ booking: booking._id });

  // Never claim a successful replay if financial records are inconsistent.
  if (!transaction) {
    throw new Error('Committed booking is missing its transaction');
  }

  return { booking, transaction };
};

// Reuse the original result, or reject a request key used for another gig.
const sendExistingResponse = (res, existing, gigId) => {
  if (String(existing.booking.gig).toLowerCase() !== gigId) {
    return res.status(409).json({
      error: 'Idempotency-Key has already been used for a different booking'
    });
  }

  return res.status(200).json({
    message: 'Booking already confirmed for this request',
    replayed: true,
    booking: toBookingResponse(existing.booking),
    transaction: toTransactionResponse(existing.transaction)
  });
};

// A second transaction may lose the unique-index race during concurrent requests.
const mayBeConcurrentReplay = (error) => {
  return error?.code === 11000 ||
    error?.code === 112 ||
    error?.hasErrorLabel?.('TransientTransactionError') === true;
};

/**
 * Atomically creates one booking and transaction per client request key.
 */
const createBooking = async (req, res, next) => {
  let session;

  try {
    const clientId = req.auth.id;
    const gigId = req.body.gigId;
    const requestKey = req.bookingRequestKey;

    // Replays must work even if the original gig has since been removed.
    const existing = await findExistingRequest(clientId, requestKey);

    if (existing) {
      return sendExistingResponse(res, existing, gigId);
    }

    session = await mongoose.startSession();

    let gig = null;
    let booking = null;
    let transaction = null;

    try {
      // The unique index and transaction keep competing requests from double-charging.
      await session.withTransaction(async () => {
        gig = null;
        booking = null;
        transaction = null;

        gig = await Gig.findOne({
          _id: gigId,
          active: true
        }).session(session);

        if (!gig) {
          return;
        }

        // Ownership and price are derived from the JWT and active database gig.
        [booking] = await Booking.create(
          [
            {
              gig: gig._id,
              client: clientId,
              freelancer: gig.freelancer,
              amount: gig.price,
              status: 'confirmed',
              requestKey
            }
          ],
          { session }
        );

        [transaction] = await Transaction.create(
          [
            {
              booking: booking._id,
              client: clientId,
              freelancer: gig.freelancer,
              amount: gig.price,
              status: 'confirmed'
            }
          ],
          { session }
        );
      });
    } catch (error) {
      if (mayBeConcurrentReplay(error)) {
        // Return the winning transaction without creating another financial record.
        const committed = await findExistingRequest(clientId, requestKey);

        if (committed) {
          return sendExistingResponse(res, committed, gigId);
        }
      }

      throw error;
    }

    if (!gig) {
      return res.status(404).json({
        error: 'Gig not found or unavailable'
      });
    }

    if (!booking || !transaction) {
      throw new Error('Booking transaction was not completed');
    }

    return res.status(201).json({
      message: 'Booking confirmed and simulated transaction recorded',
      replayed: false,
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
    }).sort({ createdAt: -1 });

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
    }).sort({ createdAt: -1 });

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

    // Include ownership in the query to prevent cross-account disclosure.
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
