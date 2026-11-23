# Test Results

Both suites were run against a freshly seeded database on 2026-11-22 (Node v22.23.5, MongoDB v8.3.7).

## 1. Postman collection (run with Newman)
```
npm run seed
newman run postman/Ecommerce_API.postman_collection.json
┌─────────────────────────┬───────────────────┬──────────────────┐
│                         │          executed │           failed │
├─────────────────────────┼───────────────────┼──────────────────┤
│              iterations │                 1 │                0 │
├─────────────────────────┼───────────────────┼──────────────────┤
│                requests │               107 │                0 │
├─────────────────────────┼───────────────────┼──────────────────┤
│            test-scripts │               107 │                0 │
├─────────────────────────┼───────────────────┼──────────────────┤
│      prerequest-scripts │                 1 │                0 │
├─────────────────────────┼───────────────────┼──────────────────┤
│              assertions │               220 │                0 │
└─────────────────────────┴───────────────────┴──────────────────┘
```

## 2. Node smoke test (`npm run smoke`)
```

Smoke test against http://localhost:5000

# Auth
  PASS  health check
  PASS  seeded users can log in
  PASS  wrong password -> 401
  PASS  register with invalid body -> 400
  PASS  register as admin is rejected -> 400
  PASS  duplicate email -> 409
  PASS  refresh token -> new tokens
  PASS  re-using old refresh token -> 401 (rotation)
  PASS  revoked family: newer refresh token also dead -> 401
  PASS  logout
  PASS  refresh after logout -> 401

# Authorization / 401 / 403 / 404
  PASS  cart without token -> 401
  PASS  garbage token -> 401
  PASS  customer creating category -> 403
  PASS  customer listing users -> 403
  PASS  seller using cart -> 403
  PASS  invalid ObjectId -> 400
  PASS  unknown product -> 404
  PASS  unknown route -> 404

# Products
  PASS  categories listed
  PASS  invalid product -> 400
  PASS  seller creates product
  PASS  search/sort/paginate
  PASS  other seller cannot edit someone's product -> 403
  PASS  negative stock adjustment below zero -> 409
  PASS  restock +0 invalid -> 400

# Cart -> Order -> Stock
  PASS  add more than stock -> 409
  PASS  add valid quantity
  PASS  server-calculated cart total = 200
  PASS  checkout with missing address -> 400
  PASS  checkout
  PASS  order total computed server-side
  PASS  stock reduced 5 -> 3
  PASS  checkout with empty cart -> 400
  PASS  customer2 cannot view customer1's order -> 403
  PASS  seller2 cannot update seller1 order -> 403
  PASS  status value not allowed by validation -> 400
  PASS  seller confirms
  PASS  transition confirmed->delivered blocked -> 409
  PASS  customer cannot ship -> 403
  PASS  customer cancels own order
  PASS  stock restored 3 -> 5 after cancel
  PASS  cancelling twice -> 409

# Concurrency: 8 customers race for 5 units (no overselling)
  PASS  exactly 5 succeed, 3 rejected (got 5 ok / 3 conflict)
  PASS  final stock is 0 (never negative)

# Reports (aggregation)
  PASS  GET /api/reports/sales-summary as admin
  PASS  GET /api/reports/best-selling as admin
  PASS  GET /api/reports/inventory-summary as admin
  PASS  GET /api/reports/low-stock as admin
  PASS  GET /api/reports/order-status as admin
  PASS  customer reading reports -> 403
  PASS  seller sales summary returns totals

Result: 52 passed, 0 failed
```

## 3. Socket.IO verification
- A connection without a token is rejected: `connect_error: Authentication required`.
- A seller socket received `connected`, `order:new`, `stock:low` and `order:status` when a customer placed an order that pushed stock below the threshold and the seller confirmed it.

## 4. Debugging notes
- Race condition on stock: a read-then-write approach would let two buyers take the last unit; fixed by the conditional atomic `$inc` update (verified by the 8-vs-5 concurrency test).
- Double cancellation could restore stock twice; fixed by making the status change a conditional update on the current status.
- Refresh-token reuse: an already-used token now revokes all sessions (verified in both suites).
