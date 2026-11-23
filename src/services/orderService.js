const crypto = require('crypto');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Order = require('../models/Order');
const AppError = require('../utils/AppError');
const appEvents = require('../events/appEvents');
const { round2 } = require('../utils/helpers');
const { emitIfLowStock } = require('./inventoryService');

const { STATUS_TRANSITIONS } = Order;

// Give stock back (used on failed checkout and on cancellation)
async function restoreStock(items) {
  if (!items.length) return;
  await Product.bulkWrite(
    items.map((i) => ({
      updateOne: { filter: { _id: i.product._id || i.product }, update: { $inc: { stock: i.quantity } } },
    }))
  );
}

/**
 * CHECKOUT: cart -> order(s)
 *  1. Re-validate every cart line against the database (never trust the client).
 *  2. Reserve stock with ONE ATOMIC conditional update per product:
 *       findOneAndUpdate({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } })
 *     MongoDB applies this atomically, so two customers can never both buy the last unit
 *     and stock can never go negative.
 *  3. If any line fails, previously reserved lines are rolled back.
 *  4. Prices are taken from the product document returned by the atomic update (server-side),
 *     and stored as a snapshot in the order. One order is created per seller.
 */
exports.checkout = async (user, { shippingAddress, paymentMethod }) => {
  const cart = await Cart.findOne({ user: user._id });
  if (!cart || cart.items.length === 0) throw new AppError('Your cart is empty', 400);

  // Friendly pre-check so the customer gets a precise list of problems
  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.product) } });
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const problems = [];
  for (const item of cart.items) {
    const p = byId.get(String(item.product));
    if (!p || !p.isActive) {
      problems.push({ productId: item.product, message: 'Product is no longer available' });
    } else if (p.stock < item.quantity) {
      problems.push({ productId: p._id, message: `Only ${p.stock} unit(s) of "${p.name}" in stock` });
    }
  }
  if (problems.length) throw new AppError('Some cart items cannot be ordered', 409, problems);

  // Atomic stock reservation with rollback
  const reserved = []; // { product: updatedDoc, quantity }
  try {
    for (const item of cart.items) {
      const updated = await Product.findOneAndUpdate(
        { _id: item.product, isActive: true, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        { new: true }
      );
      if (!updated) {
        throw new AppError('Stock changed while placing your order. Please review your cart and try again.', 409);
      }
      reserved.push({ product: updated, quantity: item.quantity });
    }
  } catch (err) {
    await restoreStock(reserved);
    throw err;
  }

  // Group by seller -> one order per seller (so each seller manages only their own orders)
  const checkoutId = crypto.randomUUID();
  const groups = new Map();
  for (const r of reserved) {
    const key = String(r.product.seller);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const docs = [...groups.entries()].map(([seller, lines]) => {
    const items = lines.map(({ product, quantity }) => ({
      product: product._id,
      name: product.name,
      price: product.price,
      quantity,
      subtotal: round2(product.price * quantity),
    }));
    return {
      checkoutId,
      customer: user._id,
      seller,
      items,
      totalAmount: round2(items.reduce((sum, i) => sum + i.subtotal, 0)),
      shippingAddress,
      payment: {
        method: paymentMethod,
        status: paymentMethod === 'SIMULATED_CARD' ? 'simulated_paid' : 'pending_cod',
        simulated: true,
      },
      status: 'pending',
      statusHistory: [{ status: 'pending', changedBy: user._id, note: 'Order placed' }],
    };
  });

  let orders;
  try {
    orders = await Order.create(docs);
  } catch (err) {
    await Order.deleteMany({ checkoutId });
    await restoreStock(reserved);
    throw err;
  }

  await Cart.updateOne({ user: user._id }, { $set: { items: [] } });

  // Announce what happened. Listeners (Socket.IO notifications) react to these events.
  orders.forEach((order) => appEvents.emit(appEvents.EVENTS.ORDER_PLACED, { order }));
  reserved.forEach(({ product, quantity }) => emitIfLowStock(product, product.stock + quantity));

  return orders;
};

/**
 * Change order status following STATUS_TRANSITIONS and role rules.
 * The update is conditional on the status we read ({_id, status}), which makes it atomic:
 * two simultaneous "cancel" requests cannot both succeed, so stock is restored exactly once.
 */
exports.changeStatus = async (orderId, newStatus, actor, note) => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);

  if (actor.role === 'seller' && String(order.seller) !== String(actor._id)) {
    throw new AppError('You can only manage orders assigned to you', 403);
  }
  if (actor.role === 'customer') {
    if (String(order.customer) !== String(actor._id)) throw new AppError('You can only manage your own orders', 403);
    if (newStatus !== 'cancelled') throw new AppError('Customers can only cancel their orders', 403);
  }

  const allowed = STATUS_TRANSITIONS[order.status];
  if (!allowed.includes(newStatus)) {
    throw new AppError(
      `Invalid status transition: ${order.status} -> ${newStatus}. Allowed: ${allowed.join(', ') || 'none (final state)'}`,
      409
    );
  }

  const set = { status: newStatus };
  if (newStatus === 'cancelled') {
    set['payment.status'] = order.payment.status === 'simulated_paid' ? 'simulated_refunded' : 'cancelled';
  }

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set: set, $push: { statusHistory: { status: newStatus, changedBy: actor._id, note } } },
    { new: true }
  );
  if (!updated) throw new AppError('Order was modified by another request. Please refresh and retry.', 409);

  if (newStatus === 'cancelled') await restoreStock(updated.items);

  appEvents.emit(appEvents.EVENTS.ORDER_STATUS_CHANGED, { order: updated, previousStatus: order.status });
  return updated;
};
