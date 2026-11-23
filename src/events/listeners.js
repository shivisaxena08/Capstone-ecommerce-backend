const appEvents = require('./appEvents');
const { emitToUser, emitToRole } = require('../sockets');

const { EVENTS } = appEvents;

const orderSummary = (order) => ({
  orderId: order._id,
  orderNumber: order.orderNumber,
  status: order.status,
  totalAmount: order.totalAmount,
  itemCount: order.items.length,
  customer: order.customer,
  seller: order.seller,
  payment: order.payment,
  createdAt: order.createdAt,
});

// Wrap each listener so an error in a notification can never crash the request that emitted the event
const safe = (name, fn) => (payload) => {
  try {
    fn(payload);
  } catch (err) {
    console.error(`[events] listener for "${name}" failed:`, err.message);
  }
};

module.exports = function registerListeners() {
  appEvents.on(
    EVENTS.ORDER_PLACED,
    safe(EVENTS.ORDER_PLACED, ({ order }) => {
      const summary = orderSummary(order);
      console.log(`[event] ${EVENTS.ORDER_PLACED} ${order.orderNumber}`);
      emitToUser(order.seller, 'order:new', summary); // seller: "you have a new order"
      emitToUser(order.customer, 'order:placed', summary); // customer: confirmation
      emitToRole('admin', 'order:new', summary);
    })
  );

  appEvents.on(
    EVENTS.ORDER_STATUS_CHANGED,
    safe(EVENTS.ORDER_STATUS_CHANGED, ({ order, previousStatus }) => {
      const payload = { ...orderSummary(order), previousStatus };
      console.log(`[event] ${EVENTS.ORDER_STATUS_CHANGED} ${order.orderNumber} ${previousStatus} -> ${order.status}`);
      emitToUser(order.customer, 'order:status', payload); // customer: status tracking
      emitToUser(order.seller, 'order:status', payload);
    })
  );

  appEvents.on(
    EVENTS.STOCK_LOW,
    safe(EVENTS.STOCK_LOW, ({ product }) => {
      const payload = {
        productId: product._id,
        name: product.name,
        stock: product.stock,
        lowStockThreshold: product.lowStockThreshold,
      };
      console.log(`[event] ${EVENTS.STOCK_LOW} "${product.name}" stock=${product.stock}`);
      emitToUser(product.seller, 'stock:low', payload);
      emitToRole('admin', 'stock:low', payload);
    })
  );
};
