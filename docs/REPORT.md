# E-Commerce and Inventory Management System
## Backend Development - Capstone Project Report

> Fill in the bracketed items, add screenshots where marked, then export to Word/PDF
> (e.g. open in VS Code with the "Markdown PDF" extension, or paste into Word).

---

## 1. Cover Page and Team Details

| | |
| --- | --- |
| Project title | E-Commerce and Inventory Management System |
| Course | Backend Development |
| Technology stack | Node.js, Express.js, MongoDB, Mongoose, JWT, bcrypt, Socket.IO |
| Team members | [Name 1 - Roll No.], [Name 2 - Roll No.], [Name 3 - Roll No.] |
| Faculty | [Name] |
| Submission date | [Date] |

## 2. Abstract / Executive Summary
This project is a RESTful backend for an online store. Customers browse products, manage a cart and place orders;
sellers manage their own listings, stock and orders; administrators manage users, categories and platform-wide activity.
The system keeps inventory accurate under concurrent purchases using atomic MongoDB operations, secures all private
operations with JWT authentication and role-based access control, produces sales and inventory analytics with MongoDB
aggregation pipelines, and pushes real-time order and low-stock notifications through Socket.IO, driven by Node.js EventEmitter events.

## 3. Problem Statement
Small online retailers need a reliable backend that (a) never sells more stock than exists, (b) separates what customers,
sellers and administrators may do, (c) calculates prices and totals securely on the server, and (d) informs sellers and
customers instantly about orders and low stock.

## 4. Project Objectives
1. Build a complete product-to-order workflow (catalogue -> cart -> order -> fulfilment).
2. Implement customer, seller and administrator roles with RBAC and ownership rules.
3. Design product, category, cart, order and inventory models with Mongoose.
4. Maintain correct stock during concurrent order attempts.
5. Generate sales and inventory reports with aggregation pipelines.
6. Provide real-time order and low-stock notifications.

## 5. Scope and Limitations
**In scope:** authentication, user/product/category/cart/order/inventory management, reports, real-time notifications, API tests.
**Out of scope / limitations:** no real payment gateway (payment is *simulated*); no frontend (API-first, with a small Socket.IO demo page);
no file upload (images are URLs); no multi-document transactions (single-document atomic operators are used, which suit a standalone MongoDB).

## 6. Requirements
**Functional:** register/login/refresh/logout; profile management; category CRUD (admin); product CRUD with search/filter/sort/pagination;
cart management; checkout; order tracking and status updates; cancellation with stock restoration; low-stock alerts; reports; notifications.
**Non-functional:** security (bcrypt, JWT, RBAC, Helmet, rate limiting, input validation); consistency (atomic stock updates);
maintainability (MVC + service layer); performance (indexes, pagination, aggregation); usability of API (consistent JSON, proper status codes).

## 7. System Architecture and Modules
**Architecture:** layered MVC.
`Client -> Express Router -> Middleware (logger, auth, RBAC, Joi validation) -> Controller -> Service -> Mongoose Model -> MongoDB -> JSON response`.
Errors from any layer reach the central `errorHandler`. Socket.IO shares the HTTP server; EventEmitter links services to notifications.

[Insert architecture diagram here]

| Module | Files | Responsibility |
| --- | --- | --- |
| Authentication | `authController`, `middleware/auth`, `utils/tokens` | register, login, token rotation, logout |
| Users | `userController` | profile, admin user management |
| Catalogue | `categoryController`, `productController` | categories, products, search/filter, stock updates |
| Cart | `cartController` | cart operations, server-side totals |
| Orders | `orderController`, `services/orderService` | checkout, status workflow, cancellation |
| Inventory | `services/inventoryService`, `productController.updateStock` | atomic stock, low-stock events |
| Reports | `reportController` | aggregation pipelines |
| Real-time | `sockets/`, `events/` | Socket.IO + EventEmitter |
| Infrastructure | `config/`, `middleware/`, `validators/`, `utils/` | env, DB, validation, errors, logging |

## 8. Database Design
See `docs/DATABASE.md` for the full collection list, schemas, relationships and indexes.
Collections: users, categories, products, carts, orders. Indexes: unique email; text index on products; compound indexes
`{seller, category}`, `{category, price}`; orders `{customer, createdAt}`, `{seller, status, createdAt}`, `{status, createdAt}`.

[Insert ER diagram here]

## 9. REST API Documentation
See `docs/API.md` (all endpoints, roles, bodies, responses and error codes) and the Postman collection in `postman/`.

## 10. Authentication and Authorization Design
- Passwords hashed with **bcrypt** (cost 12); plain text is never stored or returned.
- **Access token** (JWT, 15 min) in the `Authorization: Bearer` header; **refresh token** (JWT, 7 days).
- Refresh tokens are stored **hashed** in the database, **rotated** on each use; presenting an already-used token revokes all sessions (theft detection).
- `protect` middleware verifies the token and loads the active user; `authorize(...roles)` enforces RBAC.
- **Ownership checks**: a seller can change only their own products/orders; a customer can access only their own cart/orders.
- Registration cannot create admins; role/isActive cannot be changed through the profile endpoint.
- Login returns the same message for unknown email and wrong password (no user enumeration); auth routes are rate limited.
- Secrets live in `.env` (dotenv) which is git-ignored; `.env.example` documents the variables.

## 11. Implementation Details
- **Checkout** (`orderService.checkout`): revalidate cart -> atomically reserve stock per item (`$gte` guard) -> roll back on any failure ->
  group items by seller -> create one order per seller with price snapshots -> clear cart -> emit events.
- **Status workflow:** `pending -> confirmed -> shipped -> delivered`, `pending|confirmed -> cancelled`; enforced server-side; role rules applied;
  conditional update on the current status prevents double processing.
- **Cancellation** restores stock exactly once and marks simulated payments as refunded.
- **Aggregations:** sales summary, best sellers, inventory by category, order-status breakdown (+ a low-stock query).
- **EventEmitter:** `order:placed`, `order:statusChanged`, `stock:low` decouple business logic from notifications.
- **Socket.IO:** JWT-authenticated handshake; private rooms per user and an admin room; events `order:new`, `order:placed`, `order:status`, `stock:low`.
- **Validation:** Joi schemas for every body/query (unknown fields stripped, types coerced) + Mongoose schema validation + ObjectId checks.
- **Error handling:** `AppError` + `catchAsync` + one central handler mapping Mongoose/JWT/duplicate-key errors to proper status codes.

## 12. Testing Strategy and Test Cases
Tools: Postman collection (107 requests, 220 assertions, run with Newman) and `scripts/smoke-test.js` (52 checks). Results: `docs/TEST_RESULTS.md`.

| Category | Examples |
| --- | --- |
| Success | register, login, create product, add to cart, checkout, confirm order, reports |
| Validation failure | bad email/short password, negative price, fractional stock, empty address, invalid sort value, bad date |
| Not found | unknown product/order/user/category/route; malformed ObjectId -> 400 |
| Unauthorized (401) | no token, malformed token, refresh after logout, reused refresh token |
| Forbidden (403) | customer creating category/product, seller using cart, seller editing another seller's product/order, customer reading another's order, customer opening reports |
| Conflict (409) | duplicate email/category, quantity above stock, negative stock adjustment, invalid status transition, cancelling twice |
| Business rules | server-calculated totals, stock decrement and restoration, one order per seller, simulated-payment flag |
| Concurrency | 8 customers buy a 5-unit product simultaneously: exactly 5 succeed, 3 rejected, stock = 0 |

## 13. Screenshots / Demonstration Evidence
[Postman collection runner - all green]  
[Socket.IO demo page receiving `order:new` / `stock:low`]  
[MongoDB Compass - collections and indexes]  
[Sample API responses]

## 14. Conclusion and Future Enhancements
The system fulfils all functional and technical requirements of the project and demonstrates secure, consistent and observable backend design.
Possible enhancements: real payment gateway integration, coupons/discounts, product reviews and ratings, wishlist and recommendations,
invoice PDF generation, multi-document transactions on a replica set, automated unit/integration tests in CI, Redis caching.

## 15. References
- Node.js documentation - https://nodejs.org/docs
- Express.js guide - https://expressjs.com
- MongoDB manual (aggregation, indexes, atomic operations) - https://www.mongodb.com/docs/manual
- Mongoose documentation - https://mongoosejs.com/docs
- Socket.IO documentation - https://socket.io/docs/v4
- JSON Web Tokens (RFC 7519) - https://www.rfc-editor.org/rfc/rfc7519
- OWASP Cheat Sheet Series (Authentication, Password Storage) - https://cheatsheetseries.owasp.org
