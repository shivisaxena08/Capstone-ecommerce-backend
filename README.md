# E-Commerce and Inventory Management System (Backend)

Backend Development Capstone Project (Project 4) built with **Node.js, Express.js, MongoDB, Mongoose, JWT, bcrypt and Socket.IO**.

Customers browse products, keep a cart and place orders. Sellers manage their own products, stock and orders.
Administrators manage users, categories and overall order activity. Stock is kept correct under concurrent
purchases using atomic MongoDB operations. Payment is **simulated** (no real gateway, no card data).

---

## 1. Features

| Area | What is implemented |
| --- | --- |
| Authentication | Register/login, bcrypt password hashing, JWT **access + refresh tokens**, refresh-token **rotation** with reuse detection, logout / logout-all |
| Authorization (RBAC) | Roles `customer`, `seller`, `admin`; protected routes; ownership checks (a seller can only edit own products/orders, a customer only own cart/orders) |
| Products & categories | Full CRUD, search (text index), filter (category, price, stock, seller), sort, pagination |
| Cart | Add / update / remove / clear, availability checks, **server-calculated totals** |
| Orders | Checkout creates one order per seller, price **snapshots**, delivery details, status workflow with enforced transitions, history log |
| Inventory | **Atomic** stock decrement (`findOneAndUpdate` with `stock >= qty`) so stock never goes negative or oversells; stock restored on cancellation; low-stock detection |
| Reports | 5 MongoDB **aggregation pipelines** (sales summary, best sellers, inventory by category, order-status breakdown, low stock) - sellers see only their data |
| Real-time | **Socket.IO** (JWT-authenticated) pushes `order:new`, `order:placed`, `order:status`, `stock:low` |
| EventEmitter | Core `EventEmitter` decouples business logic from notifications (`order:placed`, `order:statusChanged`, `stock:low`) |
| Quality | Joi validation, centralized error handler, request logging, Helmet, CORS, rate-limited auth routes, consistent JSON responses |
| Testing | Postman collection (107 requests / 220 assertions) + Node smoke test (52 checks incl. a concurrency race) |

## 2. Prerequisites

- **Node.js 18+** (check with `node -v`)
- **MongoDB** - either local MongoDB Community Server (`mongodb://127.0.0.1:27017`) **or** a free MongoDB Atlas cluster
- (Optional) Postman for the API collection

## 3. Installation and run

```bash
# 1. install dependencies
npm install

# 2. create your environment file (it is git-ignored - never commit it)
cp .env.example .env          # Windows (cmd):  copy .env.example .env
#    then edit .env: set MONGO_URI and two long random JWT secrets

# 3. load sample data (wipes the collections first)
npm run seed

# 4. start the server
npm run dev      # auto-reload with nodemon
# or
npm start
```

The API is then available at **http://localhost:5000/api** (health check: `GET /api/health`).

### Environment variables (`.env`)

| Variable | Description | Example |
| --- | --- | --- |
| `NODE_ENV` | `development` or `production` | `development` |
| `PORT` | HTTP port | `5000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/ecommerce_capstone` |
| `JWT_ACCESS_SECRET` | secret for access tokens | long random string |
| `JWT_REFRESH_SECRET` | secret for refresh tokens (different from above) | long random string |
| `JWT_ACCESS_EXPIRES` | access-token lifetime | `15m` |
| `JWT_REFRESH_EXPIRES` | refresh-token lifetime | `7d` |
| `LOW_STOCK_THRESHOLD` | default low-stock threshold | `5` |
| `CLIENT_ORIGIN` | CORS / Socket.IO origin | `*` |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### Using MongoDB Atlas instead of local MongoDB
Create a free cluster, add a database user, allow your IP, copy the connection string and set
`MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/ecommerce_capstone?retryWrites=true&w=majority`.

## 4. Demo accounts (created by `npm run seed`)

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@shop.com | Admin@123 |
| Seller (TechHub) | seller1@shop.com | Seller@123 |
| Seller (HomeStyle) | seller2@shop.com | Seller@123 |
| Customer | customer1@shop.com | Customer@123 |
| Customer | customer2@shop.com | Customer@123 |

Sample data: 4 categories, 12 products (some low-stock / out-of-stock), 8 historical orders for the reports.

## 5. Testing the API

**Postman:** import `postman/Ecommerce_API.postman_collection.json`, run `npm run seed`, then run the whole
collection with the Collection Runner (folders 1 -> 8). Tokens and ids are stored automatically.
It covers: success, validation failure, not found (404), no token (401), wrong role (403), duplicate/conflict (409),
and business rules (stock limits, status transitions, ownership, cancellation restoring stock).

**Smoke test (command line):** with the server running and freshly seeded:
```bash
npm run smoke
```
It also proves the *no-overselling* guarantee: 8 customers race for 5 units - exactly 5 succeed, 3 are rejected, stock ends at 0.

Recorded results of both runs are in `docs/TEST_RESULTS.md`.

## 6. Real-time demo (Socket.IO)

1. Start the server and open **http://localhost:5000/socket-demo.html**.
2. Log in as `seller1@shop.com` and click *Login & Connect*.
3. In Postman, as `customer1`, add a TechHub product to the cart and `POST /api/orders`.
4. The page instantly shows `order:new` (and `stock:low` when stock crosses the threshold). Changing the order status
   as the seller shows `order:status`.

Event names, payloads, authentication and rooms are documented in [`docs/API.md`](docs/API.md#real-time-socketio).

## 7. Project structure

```
server.js                 entry point: DB connect, HTTP + Socket.IO, listeners, graceful shutdown
src/
  app.js                  Express app: security middleware, routes, error handling
  config/                 env.js (dotenv + validation), db.js (Mongoose connection)
  models/                 User, Category, Product, Cart, Order (schemas, validation, indexes)
  routes/                 URL -> middleware chain -> controller
  middleware/             auth (JWT + RBAC), validate (Joi + ObjectId), errorHandler, requestLogger
  validators/             Joi schemas for every request body/query
  controllers/            request/response handling (thin)
  services/               business logic: orderService (checkout, status), inventoryService
  events/                 appEvents.js (EventEmitter) + listeners.js (react to events)
  sockets/                Socket.IO server, JWT handshake auth, rooms, emit helpers
  utils/                  AppError, catchAsync, tokens, pagination, response helper
scripts/                  seed.js, smoke-test.js
postman/                  Postman collection
public/socket-demo.html   tiny page to demo real-time events
```

**Request flow:** `Route -> Middleware (auth, role, validation) -> Controller -> Service/Model -> MongoDB -> JSON Response`
(any error -> `errorHandler` -> consistent error JSON).

## 8. Key design decisions

- **MVC + service layer.** Controllers stay thin; multi-step business logic (checkout, status changes) lives in `services/`.
- **Atomic stock control.** `Product.findOneAndUpdate({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } })` is a single atomic
  operation in MongoDB; it works on a standalone server (no replica set needed). Failed multi-item checkouts roll back reserved stock.
- **One order per seller.** A cart with items from several sellers is split at checkout so each seller manages only their own orders.
- **Server-side truth.** Prices, totals and availability are always recalculated on the server; the client never sends prices.
- **Token security.** Short-lived access token (15 min); refresh tokens are stored **hashed**, rotated on every use, and reuse of an old token revokes all sessions.
- **bcrypt:** implemented with the `bcryptjs` package (pure-JS bcrypt, cost factor 12) so it installs on every OS without native build tools.
- **Simulated payment.** Orders store `payment.simulated = true`; `SIMULATED_CARD` marks the order as `simulated_paid`, `COD` as `pending_cod`.

## 9. Documentation

- [`docs/API.md`](docs/API.md) - every endpoint, auth rule, request, response and errors; Socket.IO events
- [`docs/DATABASE.md`](docs/DATABASE.md) - collections, schemas, relationships, indexes
- [`docs/REPORT.md`](docs/REPORT.md) - project report (fill in team details, add screenshots)
