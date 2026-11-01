import test from 'node:test';
import assert from 'node:assert/strict';
import { findLeak } from '../src/leakcheck.js';
import { createRoom } from '../src/state.js';
import { bugs } from '../src/fixtures/bugs.js';

const cart = createRoom(bugs[0]);
const page = createRoom(bugs[1]);

test('logs role: quoting a source line leaks', () => {
  assert.equal(
    findLeak('Your partner wrote: const discounted = lines * 0.9;', cart, 'logs'),
    true
  );
});

test('logs role: using a code-only identifier leaks', () => {
  assert.equal(findLeak('Try Math.round on the sum.', cart, 'logs'), true);
  assert.equal(findLeak('apply the discount to the discounted variable', cart, 'logs'), true);
});

test('logs role: naming a source file path leaks', () => {
  assert.equal(findLeak('Have a look at src/cart.js', cart, 'logs'), true);
});

test('logs role: quoting its own labels, values, and test names is fine', () => {
  assert.equal(
    findLeak('lineCents(items[2]) shows 113 and the expected total is 416.', cart, 'logs'),
    false
  );
  assert.equal(
    findLeak('The failing test is "orderTotalCents totals a cart with a $1.125 line item".', cart, 'logs'),
    false
  );
});

test('logs role: generic wording with no code passes', () => {
  assert.equal(
    findLeak('Your third line looks one cent higher than expected after the discount.', cart, 'logs'),
    false
  );
});

test('source role: any runtime value leaks', () => {
  assert.equal(findLeak('The cart currently totals 417 cents.', cart, 'source'), true);
  assert.equal(findLeak('The unrounded discounted total is 416.25.', cart, 'source'), true);
  assert.equal(findLeak('your third line shows 113 cents', cart, 'source'), true);
});

test('source role: log labels leak too', () => {
  assert.equal(findLeak('the log labelled orderTotalCents(cart)', cart, 'source'), true);
});

test('source role: quoting the failing test output leaks', () => {
  assert.equal(findLeak('The suite says: Expected: 416 Received: 417', cart, 'source'), true);
});

test('source role: code and its identifiers are fine', () => {
  assert.equal(
    findLeak('The discount is applied to the rounded lines; round once at the end instead.', cart, 'source'),
    false
  );
  assert.equal(findLeak('Move the rounding after the discount.', cart, 'source'), false);
});

test('questions are checked the same way as answers', () => {
  assert.equal(findLeak('why does const lines = items.reduce( fail?', cart, 'logs'), true);
  assert.equal(findLeak('is the expected total 416?', cart, 'source'), true);
});

test('other fixtures obey the same rules', () => {
  assert.equal(findLeak('the code has start + size - 1', page, 'logs'), true);
  assert.equal(findLeak('the list came back as ["a","b"]', page, 'source'), true);
  assert.equal(findLeak('your second page looks one item short.', page, 'logs'), false);
});
