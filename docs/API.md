# REST API Documentation

Base URL: `http://localhost:5000/api`  |  Content-Type: `application/json`

**Authentication:** protected endpoints need the header `Authorization: Bearer <accessToken>`.

**Response format**
```json
{ "success": true, "message": "optional", "data": { }, "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 } }
```
**Error format**
```json
{ "success": false, "message": "Validation failed", "errors": [ { "field": "email", "message": "email must be a valid email" } ] }
```

| Status | Meaning in this API |
| --- | --- |
| 200 / 201 | Success / created |
| 400 | Validation failure, malformed id/JSON, business rule on input |
| 401 | Missing / invalid / expired token, wrong credentials |
| 403 | Authenticated but role or ownership not allowed |
| 404 | Resource or route not found |
| 409 | Conflict: duplicate, insufficient stock, invalid status transition |
| 429 | Too many auth requests (rate limit) |
| 500 | Unexpected server error |

Pagination query params (list endpoints): `page` (default 1), `limit` (default 10, max 100).

---

## Authentication  `/api/auth`

| Method & Path | Auth | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /auth/register` | none | `name`, `email`, `password` (min 8, letter+number), `role` (`customer`\|`seller`, default customer), `phone?` | 201 `{ user, accessToken, refreshToken }` | 400 validation (admin role is refused), 409 email exists |
| `POST /auth/login` | none | `email`, `password` | 200 `{ user, accessToken, refreshToken }` | 400, 401 invalid credentials, 403 deactivated |
| `POST /auth/refresh` | none | `refreshToken` | 200 `{ accessToken, refreshToken }` (old refresh token is consumed) | 401 invalid/expired/**already used** (all sessions revoked) |
| `POST /auth/logout` | none | `refreshToken` | 200 | 400 |
| `POST /auth/logout-all` | Bearer | - | 200 | 401 |

Sample login response:
```json
{ "success": true, "message": "Login successful",
  "data": { "user": { "_id": "...", "name": "Aarav Sharma", "email": "customer1@shop.com", "role": "customer" },
            "accessToken": "eyJ...", "refreshToken": "eyJ..." } }
```

## Users  `/api/users`

| Method & Path | Auth / Role | Body / Params | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /users/me` | any user | - | 200 profile | 401 |
| `PATCH /users/me` | any user | `name?`, `phone?`, `address?` (at least one; role/email cannot be changed) | 200 | 400, 401 |
| `PATCH /users/me/password` | any user | `currentPassword`, `newPassword` | 200 (sessions revoked) | 400, 401 wrong current password |
| `GET /users` | admin | query: `role`, `isActive`, `q`, `page`, `limit` | 200 + meta | 401, 403 |
| `POST /users` | admin | `name`, `email`, `password`, `role` | 201 | 400, 409 |
| `GET /users/:id` | admin | - | 200 | 400 bad id, 404 |
| `PATCH /users/:id` | admin | `name?`, `role?`, `isActive?`, `phone?` | 200 | 400, 404 |
| `DELETE /users/:id` | admin | - | 200 | 400 (self), 404 |

## Categories  `/api/categories`

| Method & Path | Auth / Role | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /categories` | public | - | 200 list | - |
| `GET /categories/:id` | public | - | 200 | 400, 404 |
| `POST /categories` | admin | `name`, `description?` | 201 | 400, 401, 403, 409 duplicate |
| `PATCH /categories/:id` | admin | `name?`, `description?`, `isActive?` | 200 | 400, 404 |
| `DELETE /categories/:id` | admin | - | 200 | 404, 409 category still has products |

## Products  `/api/products`

| Method & Path | Auth / Role | Body / Query | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /products` | public | `q` (keyword, text index), `category`, `seller`, `minPrice`, `maxPrice`, `inStock`, `sort` (`price`,`-price`,`name`,`-name`,`createdAt`,`-createdAt`), `page`, `limit` | 200 + meta | 400 invalid query |
| `GET /products/:id` | public | - | 200 | 400, 404 |
| `GET /products/mine` | seller | `page`, `limit` | 200 own products | 401, 403 |
| `POST /products` | seller, admin | `name`, `description?`, `price`, `category`, `stock`, `lowStockThreshold?`, `images?`, `seller` (admin only) | 201 | 400, 401, 403 |
| `PATCH /products/:id` | owner seller, admin | `name?`, `description?`, `price?`, `category?`, `lowStockThreshold?`, `images?`, `isActive?` | 200 | 400, 403 not owner, 404 |
| `PATCH /products/:id/stock` | owner seller, admin | **either** `stock` (absolute) **or** `adjustment` (+/- integer, atomic) | 200 | 400, 403, 404, 409 would go negative |
| `DELETE /products/:id` | owner seller, admin | - | 200 | 403, 404 |

> Keyword search uses MongoDB's text index, which matches whole words (e.g. `Keyboard`, not `Keyb`).

## Cart  `/api/cart`  (role: customer)

| Method & Path | Body | Success | Errors |
| --- | --- | --- | --- |
| `GET /cart` | - | 200 `{ items[{product, quantity, unitPrice, lineTotal, available}], itemCount, total, hasUnavailableItems }` | 401, 403 |
| `POST /cart/items` | `productId`, `quantity` (default 1) | 201 cart view | 400, 404 product, 409 exceeds stock |
| `PATCH /cart/items/:productId` | `quantity` | 200 | 400, 404, 409 |
| `DELETE /cart/items/:productId` | - | 200 | 404 |
| `DELETE /cart` | - | 200 (cleared) | - |

Totals are always computed by the server from current product prices.

## Orders  `/api/orders`

| Method & Path | Auth / Role | Body / Query | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /orders` | customer | `shippingAddress{fullName, phone, line1, line2?, city, state, postalCode, country?}`, `paymentMethod` (`COD`\|`SIMULATED_CARD`) | 201 **array of orders** (one per seller) | 400 empty cart/validation, 409 stock/availability changed |
| `GET /orders` | any (scoped by role: customer = own, seller = assigned, admin = all) | `status`, `from`, `to`, `page`, `limit` | 200 + meta | 400, 401 |
| `GET /orders/:id` | owner customer, owner seller, admin | - | 200 | 403, 404 |
| `PATCH /orders/:id/status` | owner seller, admin | `status` (`confirmed`\|`shipped`\|`delivered`\|`cancelled`), `note?` | 200 | 400, 403, 404, 409 invalid transition |
| `POST /orders/:id/cancel` | owner customer, owner seller, admin | `note?` | 200 (stock restored) | 403, 404, 409 not cancellable |

**Status workflow:** `pending -> confirmed -> shipped -> delivered`; `pending|confirmed -> cancelled` (final states cannot change).
Customers may only cancel. Cancellation restores stock exactly once (conditional update on the current status).

Sample order item snapshot:
```json
{ "orderNumber": "ORD-MH2K3-A1B2C3", "status": "pending", "totalAmount": 1100,
  "items": [ { "product": "...", "name": "Postman Gadget", "price": 550, "quantity": 2, "subtotal": 1100 } ],
  "payment": { "method": "SIMULATED_CARD", "status": "simulated_paid", "simulated": true } }
```

## Reports  `/api/reports`  (roles: seller = own data only, admin = all)

| Endpoint | Aggregation | Query | Returns |
| --- | --- | --- | --- |
| `GET /reports/sales-summary` | `$match -> $group -> $sort -> $project` | `from`, `to`, `groupBy=day\|month` | `{ periods:[{period, orders, itemsSold, revenue}], totals }` (cancelled orders excluded) |
| `GET /reports/best-selling` | `$match -> $unwind -> $group -> $sort -> $limit -> $lookup -> $project` | `from`, `to`, `limit` | top products by units sold with revenue and current stock |
| `GET /reports/inventory-summary` | `$match -> $group -> $lookup -> $unwind -> $project -> $sort` | - | per category: products, totalUnits, stockValue, lowStockProducts, outOfStock |
| `GET /reports/order-status` | `$match -> $group -> $project -> $sort` | `from`, `to` | orders & amount per status |
| `GET /reports/low-stock` | query with `$expr` | - | products where `stock <= lowStockThreshold` |

Errors: 400 invalid query (e.g. bad date), 401, 403 for customers.

---

## Real-time (Socket.IO)

**Connection:** same host/port as the API. A valid **access token** is mandatory; unauthenticated sockets are rejected
with `connect_error: Authentication required`.
```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:5000', { auth: { token: accessToken } });
socket.on('order:new', (o) => console.log('New order', o));
```
**Rooms (joined automatically):** `user:<userId>` (private notifications) and `role:admin` (admins only).

| Event (server -> client) | Delivered to | Triggered by | Payload |
| --- | --- | --- | --- |
| `connected` | the connecting socket | successful handshake | `{ userId, role, message }` |
| `order:new` | seller of the order + admins | checkout | `{ orderId, orderNumber, status, totalAmount, itemCount, customer, seller, payment, createdAt }` |
| `order:placed` | the customer | checkout | same as above (confirmation) |
| `order:status` | customer and seller | status change / cancel | same as above + `previousStatus` |
| `stock:low` | product's seller + admins | stock crosses `lowStockThreshold` (checkout or manual stock update) | `{ productId, name, stock, lowStockThreshold }` |

**EventEmitter (internal):** `order:placed`, `order:statusChanged`, `stock:low` are emitted by the services; listeners in
`src/events/listeners.js` turn them into the Socket.IO messages above. Purpose: services stay unaware of how users are notified.
