const appEvents = require('../events/appEvents');

// Emit STOCK_LOW only when stock *crosses* the threshold, so sellers aren't spammed on every sale.
exports.emitIfLowStock = (product, previousStock) => {
  if (product.stock <= product.lowStockThreshold && previousStock > product.lowStockThreshold) {
    appEvents.emit(appEvents.EVENTS.STOCK_LOW, { product });
  }
};
