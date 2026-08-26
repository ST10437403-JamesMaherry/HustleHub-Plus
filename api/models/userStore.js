// Import Node.js' built-in crypto utility for generating unique user IDs.
const { randomUUID } = require('crypto');

// Temporary in-memory user storage for Part 1.
// This will later be replaced with persistent database storage such as MongoDB.
const users = [];

/**
 * Creates and stores a new user.
 *
 * The function expects a password hash rather than a plaintext password
 * so that the storage layer never needs to retain raw credentials.
 */
const createUser = ({
  fullName,
  email,
  passwordHash,
  role
}) => {
  const user = {
    // Generate a unique identifier for the user.
    id: randomUUID(),

    // Remove unnecessary whitespace from the user's name.
    fullName: fullName.trim(),

    // Normalise email addresses so lookups and duplicate checks are consistent.
    email: email.trim().toLowerCase(),

    // Store only the hashed password, never the plaintext password.
    passwordHash,

    // Store the user's application role.
    role
  };

  // Add the new user to the temporary in-memory collection.
  users.push(user);

  // Return the newly created user to the calling service/controller.
  return user;
};

/**
 * Finds a user by email address.
 *
 * Email input is normalised so values such as
 * "USER@example.com" and "user@example.com" are treated consistently.
 */
const findUserByEmail = (email) => {
  const normalisedEmail = email.trim().toLowerCase();

  return users.find(
    (user) => user.email === normalisedEmail
  );
};

/**
 * Finds a user by their unique ID.
 */
const findUserById = (id) => {
  return users.find((user) => user.id === id);
};

// Export only the operations required by the rest of the application.
// The internal users array is intentionally not exposed directly.
module.exports = {
  createUser,
  findUserByEmail,
  findUserById
};