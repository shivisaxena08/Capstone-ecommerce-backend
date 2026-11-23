# Database Design (MongoDB + Mongoose)

## Collections and relationships

```
User (customer | seller | admin)
 |-- 1 : 1 --- Cart (user)             Cart.items[] -> Product
 |-- 1 : N --- Product (seller)        Product.category -> Category
 |-- 1 : N --- Order (customer)        Order.items[] = snapshot of Product (+ ref)
 '-- 1 : N --- Order (seller)
Category 1 : N Product
```
References are used for entities that change independently (users, products, categories). Order items are **embedded
snapshots** (name, price, quantity, subtotal) so history stays correct if a product is later edited or deleted.

## Schemas (summary)

### users
| Field | Type / rules |
| --- | --- |
| name | String, required, 2-60 |
| email | String, required, **unique**, lowercase, regex-validated |
| password | String, required, min 8, `select:false`, **bcrypt hash** (cost 12) via pre-save hook |
| role | enum `customer`, `seller`, `admin` (default customer) |
| phone, address{line1,line2,city,state,postalCode,country} | optional |
| isActive | Boolean (default true) |
| refreshTokens[] | `{ tokenHash (SHA-256), expiresAt }`, `select:false`, max 5 sessions |
| timestamps | createdAt, updatedAt |

### categories
`name` (unique, 2-60), `slug` (unique, auto-generated), `description`, `isActive`.

### products
| Field | Rules |
| --- | --- |
| name | required, 2-120 |
| description | max 2000 |
| price | Number, required, min 0 |
| category | ObjectId -> Category, required |
| seller | ObjectId -> User, required |
| stock | integer, min 0 (validated) |
| lowStockThreshold | min 0, default from `LOW_STOCK_THRESHOLD` |
| images[], isActive | optional / default true |
| virtual `isLowStock` | `stock <= lowStockThreshold` |

### carts
`user` (ObjectId, **unique** -> one cart per user), `items[] { product -> Product, quantity (integer >= 1) }`.

### orders
| Field | Notes |
| --- | --- |
| orderNumber | unique, generated (`ORD-...`) |
| checkoutId | groups the per-seller orders created by one checkout |
| customer, seller | ObjectId -> User |
| items[] | `{ product, name, price, quantity, subtotal }` (price snapshot), at least one |
| totalAmount | computed on the server |
| shippingAddress | fullName, phone, line1, line2?, city, state, postalCode, country (required fields validated) |
| status | enum `pending, confirmed, shipped, delivered, cancelled` |
| statusHistory[] | `{ status, changedBy, note, at }` audit trail |
| payment | `{ method: COD|SIMULATED_CARD, status, simulated: true }` - **payment is simulated** |

## Indexes

| Collection | Index | Purpose |
| --- | --- | --- |
| users | `{ email: 1 }` unique | login lookup, prevent duplicates |
| users | `{ role: 1, isActive: 1 }` | admin user filtering |
| products | text index on `name` (weight 5), `description` (weight 1) | keyword search |
| products | `{ seller: 1, category: 1 }` | seller's products / seller reports |
| products | `{ category: 1, price: 1 }` | category browsing with price filter/sort |
| categories | `{ name: 1 }`, `{ slug: 1 }` unique | no duplicate categories |
| carts | `{ user: 1 }` unique | one cart per user |
| orders | `{ customer: 1, createdAt: -1 }` | customer order history |
| orders | `{ seller: 1, status: 1, createdAt: -1 }` | seller dashboard, filter by status |
| orders | `{ status: 1, createdAt: -1 }` | admin overview, report `$match` |
| orders | `{ orderNumber: 1 }` unique, `{ checkoutId: 1 }` | lookups |

## Aggregation pipelines (src/controllers/reportController.js)
1. **Sales summary** - `$match` (not cancelled, date range, seller) -> `$group` by `$dateToString` -> `$sort` -> `$project`.
2. **Best-selling products** - `$match` -> `$unwind: "$items"` -> `$group` by product -> `$sort` -> `$limit` -> `$lookup` products -> `$project`.
3. **Inventory summary by category** - `$match` -> `$group` (sum stock, stock value, low/out-of-stock counts) -> `$lookup` categories -> `$unwind` -> `$project` -> `$sort`.
4. **Order status breakdown** - `$match` -> `$group` by status -> `$project` -> `$sort`.

## Inventory consistency (concurrency)
Stock changes use single-document atomic operators:
- Reserve: `findOneAndUpdate({ _id, isActive: true, stock: { $gte: qty } }, { $inc: { stock: -qty } })`
- Manual adjustment: `findOneAndUpdate({ _id, stock: { $gte: -adjustment } }, { $inc: { stock: adjustment } })`
- Restore on cancel: `$inc: { stock: +qty }`, executed only after an atomic status update
  `findOneAndUpdate({ _id, status: <current> }, { $set: { status: 'cancelled' } })` succeeds (prevents double restoration).

Because MongoDB executes each such update atomically on a document, two simultaneous buyers can never both take the last unit.
(Multi-document transactions would additionally need a replica set; the per-item atomic update + rollback used here
works on a standalone MongoDB, which keeps setup simple.)

## Seed data
`npm run seed` creates 5 users (admin, 2 sellers, 2 customers), 4 categories, 12 products (incl. low-stock and out-of-stock items)
and 8 orders in different statuses spread over the last 4 weeks so reports return meaningful data.
