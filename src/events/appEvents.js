const { EventEmitter } = require('events');

/*
 * Application-wide EventEmitter (Node.js core module).
 * PURPOSE: decouple business logic from side-effects. The order/inventory services only announce
 * *what happened* (ORDER_PLACED, STOCK_LOW ...). Listeners (src/events/listeners.js) decide what to do
 * about it (push Socket.IO notifications, write logs). New reactions (e-mail, SMS) can be added
 * without touching the order code.
 */
class AppEvents extends EventEmitter {}
const appEvents = new AppEvents();

appEvents.EVENTS = Object.freeze({
  ORDER_PLACED: 'order:placed',
  ORDER_STATUS_CHANGED: 'order:statusChanged',
  STOCK_LOW: 'stock:low',
});

module.exports = appEvents;
