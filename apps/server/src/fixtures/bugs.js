export const bugs = [
  {
    id: 'cart-cent',
    title: 'Order total is off by one cent',
    source: [
      {
        path: 'src/cart.js',
        content: `export function lineCents(item) {
  return Math.round(item.price * item.qty * 100);
}

export function orderTotalCents(items) {
  const lines = items.reduce(
    (sum, item) => sum + lineCents(item),
    0
  );
  const discounted = lines * 0.9;
  return Math.round(discounted);
}
`,
      },
    ],
    logs: [
      { id: 'cart-1', ts: 1718000001001, label: 'lineCents(items[0])', value: 200 },
      { id: 'cart-2', ts: 1718000001002, label: 'lineCents(items[1])', value: 150 },
      { id: 'cart-3', ts: 1718000001003, label: 'lineCents(items[2])', value: 113 },
      { id: 'cart-4', ts: 1718000001004, label: 'orderTotalCents(cart)', value: 417 },
      { id: 'cart-5', ts: 1718000001005, label: 'expected orderTotalCents(cart)', value: 416 },
    ],
    tests: [
      { name: 'lineCents converts dollars to cents', status: 'pass' },
      { name: 'orderTotalCents totals a cart with a $1.125 line item', status: 'fail' },
      { name: 'orderTotalCents handles an empty cart', status: 'pass' },
    ],
    testOutput: `FAIL src/cart.test.js
  ✕ orderTotalCents totals a cart with a $1.125 line item (2 ms)
    Expected: 416
    Received: 417

Tests: 1 failed, 2 passed, 3 total`,
    fixedSource: [
      {
        path: 'src/cart.js',
        content: `export function lineCents(item) {
  return Math.round(item.price * item.qty * 100);
}

export function orderTotalCents(items) {
  const raw = items.reduce((sum, item) => sum + item.price * item.qty * 100, 0);
  const discounted = raw * 0.9;
  return Math.round(discounted);
}
`,
      },
    ],
  },
  {
    id: 'page-slice',
    title: 'Last item of every page is missing',
    source: [
      {
        path: 'src/paginate.js',
        content: `export function paginate(items, page, size) {
  const start = (page - 1) * size;
  return {
    items: items.slice(start, start + size - 1),
    page,
    size,
  };
}
`,
      },
    ],
    logs: [
      { id: 'page-1', ts: 1718000002001, label: 'paginate(items, 1, 3).items.length', value: 2 },
      { id: 'page-2', ts: 1718000002002, label: 'paginate(items, 1, 3).items', value: ['a', 'b'] },
      { id: 'page-3', ts: 1718000002003, label: 'items (full list)', value: ['a', 'b', 'c'] },
    ],
    tests: [
      { name: 'paginate returns exactly size items', status: 'fail' },
      { name: 'paginate returns the final short page', status: 'pass' },
      { name: 'paginate past the end returns empty', status: 'pass' },
    ],
    testOutput: `FAIL src/paginate.test.js
  ✕ paginate returns exactly size items (1 ms)
    Expected: ["a", "b", "c"]
    Received: ["a", "b"]

Tests: 1 failed, 2 passed, 3 total`,
    fixedSource: [
      {
        path: 'src/paginate.js',
        content: `export function paginate(items, page, size) {
  const start = (page - 1) * size;
  return {
    items: items.slice(start, start + size),
    page,
    size,
  };
}
`,
      },
    ],
  },
  {
    id: 'utc-day',
    title: 'Weekend flag fires on the wrong day',
    source: [
      {
        path: 'src/schedule.js',
        content: `export function isWeekend(isoDate) {
  const day = new Date(isoDate).getDay();
  return day === 0 || day === 6;
}
`,
      },
    ],
    logs: [
      { id: 'utc-1', ts: 1718000003001, label: 'isWeekend("2024-06-01")', value: false },
      { id: 'utc-2', ts: 1718000003002, label: 'new Date("2024-06-01").getDay()', value: 5 },
      { id: 'utc-3', ts: 1718000003003, label: 'expected isWeekend("2024-06-01")', value: true },
    ],
    tests: [
      { name: 'isWeekend marks Saturday', status: 'fail' },
      { name: 'isWeekend marks Sunday', status: 'fail' },
      { name: 'isWeekend rejects a weekday', status: 'pass' },
    ],
    testOutput: `FAIL src/schedule.test.js
  ✕ isWeekend marks Saturday (1 ms)
    Expected: true
    Received: false
  ✕ isWeekend marks Sunday (1 ms)
    Expected: true
    Received: false

Tests: 2 failed, 1 passed, 3 total`,
    fixedSource: [
      {
        path: 'src/schedule.js',
        content: `export function isWeekend(isoDate) {
  const day = new Date(isoDate + 'T00:00:00Z').getUTCDay();
  return day === 0 || day === 6;
}
`,
      },
    ],
  },
];

export function getBug(id) {
  return bugs.find((bug) => bug.id === id) ?? null;
}
