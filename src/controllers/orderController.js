const Order = require('../models/Order');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/apiResponse');
const { getPagination, buildMeta } = require('../utils/pagination');
const orderService = require('../services/orderService');

// Role-scoped visibility: customers see their orders, sellers see orders assigned to them, admins see all
const scopeFilter = (user) => {
  if (user.role === 'customer') return { customer: user._id };
  if (user.role === 'seller') return { seller: user._id };
  return {};
};

exports.checkout = catchAsync(async (req, res) => {
  const orders = await orderService.checkout(req.user, req.body);
  sendSuccess(res, orders, {
    status: 201,
    message: `Order placed (${orders.length} order${orders.length > 1 ? 's' : ''}, one per seller). Payment is SIMULATED.`,
  });
});

exports.list = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = scopeFilter(req.user);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = req.query.from;
    if (req.query.to) filter.createdAt.$lte = req.query.to;
  }
  const [orders, total] = await Promise.all([
    Order.find(filter).populate('customer', 'name email').populate('seller', 'name').sort('-createdAt').skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);
  sendSuccess(res, orders, { meta: buildMeta(page, limit, total) });
});

exports.get = catchAsync(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('customer', 'name email').populate('seller', 'name');
  if (!order) throw new AppError('Order not found', 404);
  const { role, _id } = req.user;
  const ownerId = (ref) => String(ref._id || ref);
  if (
    (role === 'customer' && ownerId(order.customer) !== String(_id)) ||
    (role === 'seller' && ownerId(order.seller) !== String(_id))
  ) {
    throw new AppError('You do not have access to this order', 403);
  }
  sendSuccess(res, order);
});

exports.updateStatus = catchAsync(async (req, res) => {
  const order = await orderService.changeStatus(req.params.id, req.body.status, req.user, req.body.note);
  sendSuccess(res, order, { message: `Order status updated to ${order.status}` });
});

exports.cancel = catchAsync(async (req, res) => {
  const order = await orderService.changeStatus(req.params.id, 'cancelled', req.user, req.body.note || 'Cancelled');
  sendSuccess(res, order, { message: 'Order cancelled and stock restored' });
});
