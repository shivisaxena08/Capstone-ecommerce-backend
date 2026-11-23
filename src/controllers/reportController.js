const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/apiResponse');

// Sellers only ever see their own data; admins see the whole platform.
const sellerScope = (user, field = 'seller') =>
  user.role === 'seller' ? { [field]: new mongoose.Types.ObjectId(user._id) } : {};

const dateRange = ({ from, to }) => {
  if (!from && !to) return {};
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return { createdAt: range };
};

/*
 * AGGREGATION #1 - Sales summary: revenue / orders / units per day (or month), cancelled orders excluded.
 * Pipeline: $match -> $group (by formatted date) -> $sort -> $project
 */
exports.salesSummary = catchAsync(async (req, res) => {
  const format = req.query.groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const match = { status: { $ne: 'cancelled' }, ...sellerScope(req.user), ...dateRange(req.query) };

  const periods = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format, date: '$createdAt' } },
        orders: { $sum: 1 },
        revenue: { $sum: '$totalAmount' },
        itemsSold: { $sum: { $sum: '$items.quantity' } },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, period: '$_id', orders: 1, itemsSold: 1, revenue: { $round: ['$revenue', 2] } } },
  ]);

  const totals = periods.reduce(
    (t, p) => ({ orders: t.orders + p.orders, itemsSold: t.itemsSold + p.itemsSold, revenue: t.revenue + p.revenue }),
    { orders: 0, itemsSold: 0, revenue: 0 }
  );
  totals.revenue = Math.round(totals.revenue * 100) / 100;
  sendSuccess(res, { groupBy: req.query.groupBy, periods, totals });
});

/*
 * AGGREGATION #2 - Best-selling products.
 * Pipeline: $match -> $unwind items -> $group by product -> $sort -> $limit -> $lookup (current stock) -> $project
 */
exports.bestSelling = catchAsync(async (req, res) => {
  const match = { status: { $ne: 'cancelled' }, ...sellerScope(req.user), ...dateRange(req.query) };
  const products = await Order.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        unitsSold: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.subtotal' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { unitsSold: -1, revenue: -1 } },
    { $limit: req.query.limit },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'current' } },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        name: 1,
        unitsSold: 1,
        orders: 1,
        revenue: { $round: ['$revenue', 2] },
        currentStock: { $ifNull: [{ $arrayElemAt: ['$current.stock', 0] }, null] },
      },
    },
  ]);
  sendSuccess(res, products);
});

/*
 * AGGREGATION #3 - Inventory summary per category.
 * Pipeline: $match -> $group (by category) -> $lookup (category name) -> $unwind -> $project -> $sort
 */
exports.inventorySummary = catchAsync(async (req, res) => {
  const summary = await Product.aggregate([
    { $match: sellerScope(req.user) },
    {
      $group: {
        _id: '$category',
        products: { $sum: 1 },
        totalUnits: { $sum: '$stock' },
        stockValue: { $sum: { $multiply: ['$price', '$stock'] } },
        lowStockProducts: { $sum: { $cond: [{ $lte: ['$stock', '$lowStockThreshold'] }, 1, 0] } },
        outOfStock: { $sum: { $cond: [{ $eq: ['$stock', 0] }, 1, 0] } },
      },
    },
    { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        categoryId: '$_id',
        category: { $ifNull: ['$category.name', 'Unknown'] },
        products: 1,
        totalUnits: 1,
        lowStockProducts: 1,
        outOfStock: 1,
        stockValue: { $round: ['$stockValue', 2] },
      },
    },
    { $sort: { stockValue: -1 } },
  ]);
  sendSuccess(res, summary);
});

// Low-stock alerts list: products whose stock is at or below their own threshold
exports.lowStock = catchAsync(async (req, res) => {
  const products = await Product.find({ ...sellerScope(req.user), $expr: { $lte: ['$stock', '$lowStockThreshold'] } })
    .select('name stock lowStockThreshold seller isActive')
    .sort('stock')
    .limit(100);
  sendSuccess(res, products);
});

/*
 * AGGREGATION #4 - Order activity by status (admin overview of platform order flow).
 */
exports.orderStatusBreakdown = catchAsync(async (req, res) => {
  const data = await Order.aggregate([
    { $match: { ...sellerScope(req.user), ...dateRange(req.query) } },
    { $group: { _id: '$status', orders: { $sum: 1 }, amount: { $sum: '$totalAmount' } } },
    { $project: { _id: 0, status: '$_id', orders: 1, amount: { $round: ['$amount', 2] } } },
    { $sort: { orders: -1 } },
  ]);
  sendSuccess(res, data);
});
