const mongoose = require('mongoose');

const Gig = require('../models/Gig');

// Return only marketplace fields required by API consumers.
const toGigResponse = (gig) => {
  return {
    id: gig.id,
    freelancer: gig.freelancer,
    title: gig.title,
    description: gig.description,
    category: gig.category,
    price: gig.price,
    active: gig.active,
    createdAt: gig.createdAt,
    updatedAt: gig.updatedAt
  };
};

/**
 * Returns active gigs available in the marketplace.
 */
const getAvailableGigs = async (req, res, next) => {
  try {
    const gigs = await Gig.find({
      active: true
    }).sort({
      createdAt: -1
    });

    return res.status(200).json({
      gigs: gigs.map(toGigResponse)
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Returns one active marketplace gig.
 */
const getGigById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'Invalid gig ID'
      });
    }

    const gig = await Gig.findOne({
      _id: req.params.id,
      active: true
    });

    if (!gig) {
      return res.status(404).json({
        error: 'Gig not found'
      });
    }

    return res.status(200).json({
      gig: toGigResponse(gig)
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Returns every gig belonging to the authenticated freelancer.
 */
const getMyGigs = async (req, res, next) => {
  try {
    const gigs = await Gig.find({
      freelancer: req.auth.id
    }).sort({
      createdAt: -1
    });

    return res.status(200).json({
      gigs: gigs.map(toGigResponse)
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Creates a gig owned by the authenticated freelancer.
 */
const createGig = async (req, res, next) => {
  try {
    // Copy only marketplace fields; ownership is always derived from the verified JWT.
    const { title, description, category, price, active } = req.body;
    const gig = await Gig.create({
      title,
      description,
      category,
      price,
      active,
      freelancer: req.auth.id
    });

    return res.status(201).json({
      message: 'Gig created successfully',
      gig: toGigResponse(gig)
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Updates a gig only when it belongs to the authenticated freelancer.
 */
const updateGig = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'Invalid gig ID'
      });
    }

    // Include ownership in the query so another freelancer cannot update it.
    const gig = await Gig.findOneAndUpdate(
      {
        _id: req.params.id,
        freelancer: req.auth.id
      },
      {
        $set: req.body
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!gig) {
      return res.status(404).json({
        error: 'Gig not found'
      });
    }

    return res.status(200).json({
      message: 'Gig updated successfully',
      gig: toGigResponse(gig)
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Deletes a gig only when it belongs to the authenticated freelancer.
 */
const deleteGig = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'Invalid gig ID'
      });
    }

    // Include ownership in the delete query to prevent cross-account deletion.
    const gig = await Gig.findOneAndDelete({
      _id: req.params.id,
      freelancer: req.auth.id
    });

    if (!gig) {
      return res.status(404).json({
        error: 'Gig not found'
      });
    }

    return res.status(200).json({
      message: 'Gig deleted successfully'
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAvailableGigs,
  getGigById,
  getMyGigs,
  createGig,
  updateGig,
  deleteGig
};