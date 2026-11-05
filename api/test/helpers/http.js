'use strict';

// Provide an Express-like request and response without opening a server.
function createHttpContext(body = {}, overrides = {}) {
  const req = {
    method: 'POST',
    originalUrl: '/unit-test',
    headers: {},
    body,
    ...overrides
  };

  const res = {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };

  const nextCalls = [];
  const next = (error) => nextCalls.push(error);

  return { req, res, next, nextCalls };
}

module.exports = { createHttpContext };
