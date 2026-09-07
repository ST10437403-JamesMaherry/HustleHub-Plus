const { randomUUID } = require('crypto');

const users = [];

class DuplicateEmailError extends Error {
  constructor() {
    super('An account with this email already exists');
    this.name = 'DuplicateEmailError';
  }
}

/**
 * Creates a user while enforcing email uniqueness at the storage boundary.
 *
 * The duplicate check and array insertion are synchronous, making this
 * operation atomic within Node.js' single process. This closes the race where
 * two controllers can both pass an earlier check while awaiting bcrypt.
 */
const createUser = ({
  fullName,
  email,
  passwordHash,
  role
}) => {
  const normalisedEmail = email.trim().toLowerCase();

  if (users.some((user) => user.email === normalisedEmail)) {
    throw new DuplicateEmailError();
  }

  const user = {
    id: randomUUID(),
    fullName: fullName.trim(),
    email: normalisedEmail,
    passwordHash,
    role
  };

  users.push(user);

  return user;
};

const findUserByEmail = (email) => {
  const normalisedEmail = email.trim().toLowerCase();

  return users.find(
    (user) => user.email === normalisedEmail
  );
};

const findUserById = (id) => {
  return users.find((user) => user.id === id);
};

module.exports = {
  DuplicateEmailError,
  createUser,
  findUserByEmail,
  findUserById
};
