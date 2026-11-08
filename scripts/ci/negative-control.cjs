'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Manual negative-control runs demonstrate that an actual failed test fails the workflow.
test('CI propagates a deliberately failing assertion', () => {
  assert.equal('intentional failure', 'passing result');
});
