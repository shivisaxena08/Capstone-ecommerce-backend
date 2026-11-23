/*
 * End-to-end smoke test against a RUNNING server (npm start) with seeded data (npm run seed).
 *   npm run smoke            (default base URL http://localhost:5000)
 *   BASE_URL=http://localhost:5000 node scripts/smoke-test.js
 * Needs Node 18+ (global fetch). Covers success, validation, 404, 401, 403, 409 and the
 * "no overselling" concurrency scenario. Creates its own test users/products.
 */
const BASE = process.env.BASE_URL || 'http://localhost:5000';
let passed = 0, failed = 0;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: json };
}
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}
const expectStatus = (name, res, status) => check(name, res.status === status, `(expected ${status}, got ${res.status}: ${JSON.stringify(res.body)?.slice(0, 200)})`);
const login = async (email, password) => (await call('POST', '/api/auth/login', { body: { email, password } })).body.data;
const address = { fullName: 'Test Buyer', phone: '9999999999', line1: '1 Test Road', city: 'Delhi', state: 'Delhi', postalCode: '110001' };

(async () => {
  console.log(`Smoke test against ${BASE}\n`);

  console.log('# Auth');
  expectStatus('health check', await call('GET', '/api/health'), 200);
  const admin = await login('admin@shop.com', 'Admin@123');
  const seller = await login('seller1@shop.com', 'Seller@123');
  const customer = await login('customer1@shop.com', 'Customer@123');
  check('seeded users can log in', admin && seller && customer, '(did you run "npm run seed"?)');
  expectStatus('wrong password -> 401', await call('POST', '/api/auth/login', { body: { email: 'admin@shop.com', password: 'nope1234' } }), 401);
  expectStatus('register with invalid body -> 400', await call('POST', '/api/auth/register', { body: { name: 'x', email: 'bad', password: '1' } }), 400);
  expectStatus('register as admin is rejected -> 400', await call('POST', '/api/auth/register', { body: { name: 'Eve', email: `eve${Date.now()}@t.com`, password: 'Passw0rd1', role: 'admin' } }), 400);
  expectStatus('duplicate email -> 409', await call('POST', '/api/auth/register', { body: { name: 'Dup', email: 'admin@shop.com', password: 'Passw0rd1' } }), 409);

  const r1 = await call('POST', '/api/auth/refresh', { body: { refreshToken: customer.refreshToken } });
  expectStatus('refresh token -> new tokens', r1, 200);
  expectStatus('re-using old refresh token -> 401 (rotation)', await call('POST', '/api/auth/refresh', { body: { refreshToken: customer.refreshToken } }), 401);
  expectStatus('revoked family: newer refresh token also dead -> 401', await call('POST', '/api/auth/refresh', { body: { refreshToken: r1.body.data.refreshToken } }), 401);
  const c = await login('customer1@shop.com', 'Customer@123'); // fresh session
  const lo = await call('POST', '/api/auth/logout', { body: { refreshToken: c.refreshToken } });
  expectStatus('logout', lo, 200);
  expectStatus('refresh after logout -> 401', await call('POST', '/api/auth/refresh', { body: { refreshToken: c.refreshToken } }), 401);
  const customerT = (await login('customer1@shop.com', 'Customer@123')).accessToken;

  console.log('\n# Authorization / 401 / 403 / 404');
  expectStatus('cart without token -> 401', await call('GET', '/api/cart'), 401);
  expectStatus('garbage token -> 401', await call('GET', '/api/users/me', { token: 'abc.def.ghi' }), 401);
  expectStatus('customer creating category -> 403', await call('POST', '/api/categories', { token: customerT, body: { name: 'Hack' } }), 403);
  expectStatus('customer listing users -> 403', await call('GET', '/api/users', { token: customerT }), 403);
  expectStatus('seller using cart -> 403', await call('GET', '/api/cart', { token: seller.accessToken }), 403);
  expectStatus('invalid ObjectId -> 400', await call('GET', '/api/products/123'), 400);
  expectStatus('unknown product -> 404', await call('GET', '/api/products/64b64b64b64b64b64b64b64b'), 404);
  expectStatus('unknown route -> 404', await call('GET', '/api/nothing-here'), 404);

  console.log('\n# Products');
  const cats = (await call('GET', '/api/categories')).body.data;
  check('categories listed', cats.length > 0);
  const stamp = Date.now();
  const bad = await call('POST', '/api/products', { token: seller.accessToken, body: { name: 'A', price: -5, category: cats[0]._id, stock: 2.5 } });
  expectStatus('invalid product -> 400', bad, 400);
  const created = await call('POST', '/api/products', { token: seller.accessToken, body: { name: `Smoke Item ${stamp}`, description: 'smoke test', price: 100, category: cats[0]._id, stock: 5 } });
  expectStatus('seller creates product', created, 201);
  const prod = created.body.data;
  const listed = await call('GET', `/api/products?q=Smoke&sort=-price&page=1&limit=5`);
  expectStatus('search/sort/paginate', listed, 200);
  const seller2 = await login('seller2@shop.com', 'Seller@123');
  expectStatus("other seller cannot edit someone's product -> 403", await call('PATCH', `/api/products/${prod._id}`, { token: seller2.accessToken, body: { price: 1 } }), 403);
  expectStatus('negative stock adjustment below zero -> 409', await call('PATCH', `/api/products/${prod._id}/stock`, { token: seller.accessToken, body: { adjustment: -100 } }), 409);
  expectStatus('restock +0 invalid -> 400', await call('PATCH', `/api/products/${prod._id}/stock`, { token: seller.accessToken, body: { adjustment: 0 } }), 400);

  console.log('\n# Cart -> Order -> Stock');
  expectStatus('add more than stock -> 409', await call('POST', '/api/cart/items', { token: customerT, body: { productId: prod._id, quantity: 99 } }), 409);
  expectStatus('add valid quantity', await call('POST', '/api/cart/items', { token: customerT, body: { productId: prod._id, quantity: 2 } }), 201);
  const cart = await call('GET', '/api/cart', { token: customerT });
  check('server-calculated cart total = 200', cart.body.data.total === 200, JSON.stringify(cart.body.data));
  expectStatus('checkout with missing address -> 400', await call('POST', '/api/orders', { token: customerT, body: {} }), 400);
  const placed = await call('POST', '/api/orders', { token: customerT, body: { shippingAddress: address, paymentMethod: 'SIMULATED_CARD' } });
  expectStatus('checkout', placed, 201);
  const order = placed.body.data[0];
  check('order total computed server-side', order.totalAmount === 200 && order.payment.simulated === true);
  check('stock reduced 5 -> 3', (await call('GET', `/api/products/${prod._id}`)).body.data.stock === 3);
  expectStatus('checkout with empty cart -> 400', await call('POST', '/api/orders', { token: customerT, body: { shippingAddress: address } }), 400);

  const other = await login('customer2@shop.com', 'Customer@123');
  expectStatus("customer2 cannot view customer1's order -> 403", await call('GET', `/api/orders/${order._id}`, { token: other.accessToken }), 403);
  expectStatus('seller2 cannot update seller1 order -> 403', await call('PATCH', `/api/orders/${order._id}/status`, { token: seller2.accessToken, body: { status: 'confirmed' } }), 403);
  expectStatus('status value not allowed by validation -> 400', await call('PATCH', `/api/orders/${order._id}/status`, { token: seller.accessToken, body: { status: 'pending' } }), 400);
  expectStatus('seller confirms', await call('PATCH', `/api/orders/${order._id}/status`, { token: seller.accessToken, body: { status: 'confirmed' } }), 200);
  expectStatus('transition confirmed->delivered blocked -> 409', await call('PATCH', `/api/orders/${order._id}/status`, { token: seller.accessToken, body: { status: 'delivered' } }), 409);
  expectStatus('customer cannot ship -> 403', await call('PATCH', `/api/orders/${order._id}/status`, { token: customerT, body: { status: 'shipped' } }), 403);
  expectStatus('customer cancels own order', await call('POST', `/api/orders/${order._id}/cancel`, { token: customerT, body: {} }), 200);
  check('stock restored 3 -> 5 after cancel', (await call('GET', `/api/products/${prod._id}`)).body.data.stock === 5);
  expectStatus('cancelling twice -> 409', await call('POST', `/api/orders/${order._id}/cancel`, { token: customerT, body: {} }), 409);

  console.log('\n# Concurrency: 8 customers race for 5 units (no overselling)');
  const buyers = [];
  for (let i = 0; i < 8; i++) {
    const reg = await call('POST', '/api/auth/register', { body: { name: `Racer ${i}`, email: `racer${stamp}_${i}@t.com`, password: 'Passw0rd1' } });
    const t = reg.body.data.accessToken;
    await call('POST', '/api/cart/items', { token: t, body: { productId: prod._id, quantity: 1 } });
    buyers.push(t);
  }
  const results = await Promise.all(buyers.map((t) => call('POST', '/api/orders', { token: t, body: { shippingAddress: address } })));
  const ok = results.filter((r) => r.status === 201).length;
  const conflict = results.filter((r) => r.status === 409).length;
  check(`exactly 5 succeed, 3 rejected (got ${ok} ok / ${conflict} conflict)`, ok === 5 && conflict === 3);
  check('final stock is 0 (never negative)', (await call('GET', `/api/products/${prod._id}`)).body.data.stock === 0);

  console.log('\n# Reports (aggregation)');
  for (const r of ['sales-summary', 'best-selling', 'inventory-summary', 'low-stock', 'order-status']) {
    expectStatus(`GET /api/reports/${r} as admin`, await call('GET', `/api/reports/${r}`, { token: admin.accessToken }), 200);
  }
  expectStatus('customer reading reports -> 403', await call('GET', '/api/reports/sales-summary', { token: customerT }), 403);
  const sales = await call('GET', '/api/reports/sales-summary?groupBy=month', { token: seller.accessToken });
  check('seller sales summary returns totals', sales.status === 200 && typeof sales.body.data.totals.revenue === 'number');

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Smoke test crashed:', e); process.exit(1); });
