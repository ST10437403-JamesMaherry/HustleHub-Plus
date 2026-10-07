const ALLOWED_GIG_FIELDS = [
  'title',
  'description',
  'category',
  'price',
  'active'
];

const REQUIRED_CREATE_FIELDS = [
  'title',
  'description',
  'category',
  'price'
];

/**
 * Builds Gig validation middleware for create and update operations.
 */
const validateGig = (requireAllFields) => {
  return (req, res, next) => {
    const body = req.body;

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return res.status(400).json({
        error: 'A gig request is required'
      });
    }

    const fields = Object.keys(body);

    if (!fields.length) {
      return res.status(400).json({
        error: 'Gig request must contain at least one field'
      });
    }

    // Reject ownership and any fields outside the Gig request contract.
    if (
      fields.some(
        (field) => !ALLOWED_GIG_FIELDS.includes(field)
      )
    ) {
      return res.status(400).json({
        error: 'Gig request contains unsupported fields'
      });
    }

    if (
      requireAllFields &&
      REQUIRED_CREATE_FIELDS.some(
        (field) => body[field] === undefined
      )
    ) {
      return res.status(400).json({
        error:
          'Title, description, category and price are required'
      });
    }

    const validatedGig = {};

    if (body.title !== undefined) {
      if (typeof body.title !== 'string') {
        return res.status(400).json({
          error: 'Title must be a valid text value'
        });
      }

      const title = body.title.trim();

      if (
        title.length < 3 ||
        title.length > 100
      ) {
        return res.status(400).json({
          error: 'Title must be between 3 and 100 characters'
        });
      }

      validatedGig.title = title;
    }

    if (body.description !== undefined) {
      if (typeof body.description !== 'string') {
        return res.status(400).json({
          error: 'Description must be a valid text value'
        });
      }

      const description = body.description.trim();

      if (
        description.length < 10 ||
        description.length > 1000
      ) {
        return res.status(400).json({
          error:
            'Description must be between 10 and 1000 characters'
        });
      }

      validatedGig.description = description;
    }

    if (body.category !== undefined) {
      if (typeof body.category !== 'string') {
        return res.status(400).json({
          error: 'Category must be a valid text value'
        });
      }

      const category = body.category.trim();

      if (
        category.length < 2 ||
        category.length > 50
      ) {
        return res.status(400).json({
          error: 'Category must be between 2 and 50 characters'
        });
      }

      validatedGig.category = category;
    }

    if (body.price !== undefined) {
      if (
        typeof body.price !== 'number' ||
        !Number.isFinite(body.price) ||
        body.price <= 0
      ) {
        return res.status(400).json({
          error: 'Price must be a positive number'
        });
      }

      validatedGig.price = body.price;
    }

    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') {
        return res.status(400).json({
          error: 'Active must be a boolean'
        });
      }

      validatedGig.active = body.active;
    }

    // Forward only validated marketplace fields.
    req.body = validatedGig;

    return next();
  };
};

const validateGigCreate = validateGig(true);
const validateGigUpdate = validateGig(false);

module.exports = {
  validateGigCreate,
  validateGigUpdate
};