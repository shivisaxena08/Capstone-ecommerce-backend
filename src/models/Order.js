const mongoose = require('mongoose');
const { generateOrderNumber } = require('../utils/helpers');

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

// Allowed status transitions (business rule). Terminal states have no outgoing transitions.
const STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true }, // snapshot
    price: { type: Number, required: true, min: 0 }, // price snapshot at purchase time
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, default: generateOrderNumber },
    checkoutId: { type: String, required: true, index: true }, // groups the per-seller orders of one checkout
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [orderItemSchema], validate: [(v) => v.length > 0, 'Order must contain at least one item'] },
    totalAmount: { type: Number, required: true, min: 0 },
    shippingAddress: {
      fullName: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      line1: { type: String, required: true, trim: true },
      line2: { type: String, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      postalCode: { type: String, required: true, trim: true },
      country: { type: String, required: true, trim: true, default: 'India' },
    },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: ORDER_STATUSES },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String,
        at: { type: Date, default: Date.now },
      },
    ],
    // No real payment gateway is integrated: payment is SIMULATED for this academic project.
    payment: {
      method: { type: String, enum: ['COD', 'SIMULATED_CARD'], default: 'COD' },
      status: {
        type: String,
        enum: ['pending_cod', 'simulated_paid', 'simulated_refunded', 'cancelled'],
        default: 'pending_cod',
      },
      simulated: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

/* ---------------- Indexes ----------------
 * {customer, createdAt:-1}  -> customer order history
 * {seller, status, createdAt:-1} -> seller dashboard / filtering by status
 * {status, createdAt:-1} -> admin overview + report $match stages
 */
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ seller: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);
Order.ORDER_STATUSES = ORDER_STATUSES;
Order.STATUS_TRANSITIONS = STATUS_TRANSITIONS;
module.exports = Order;
