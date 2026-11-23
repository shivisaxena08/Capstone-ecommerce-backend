const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');
const Cart = require('../models/Cart');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/apiResponse');
const { getPagination, buildMeta } = require('../utils/pagination');
const { emitIfLowStock } = require('../services/inventoryService');

// Loads a product and enforces ownership: sellers can only touch their own products; admins can touch any.
async function loadOwnedProduct(req) {
  const product = await Product.findById(req.params.id);
  if (!product) throw new AppError('Product not found', 404);
  if (req.user.role === 'seller' && String(product.seller) !== String(req.user._id)) {
    throw new AppError('You can only modify your own products', 403);
  }
  return product;
}

async function assertCategory(id) {
  const category = await Category.findById(id);
  if (!category || !category.isActive) throw new AppError('Category does not exist or is inactive', 400);
}

// Public: search, filter, sort, paginate
exports.list = catchAsync(async (req, res) => {
  const { q, category, seller, minPrice, maxPrice, inStock, sort } = req.query;
  const { page, limit, skip } = getPagination(req.query);
  const filter = { isActive: true };
  if (q) filter.$text = { $search: q };
  if (category) filter.category = category;
  if (seller) filter.seller = seller;
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = minPrice;
    if (maxPrice !== undefined) filter.price.$lte = maxPrice;
  }
  if (inStock) filter.stock = { $gt: 0 };

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .populate('seller', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filter),
  ]);
  sendSuccess(res, products, { meta: buildMeta(page, limit, total) });
});

exports.get = catchAsync(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, isActive: true })
    .populate('category', 'name slug')
    .populate('seller', 'name');
  if (!product) throw new AppError('Product not found', 404);
  sendSuccess(res, product);
});

// Seller: own products (including inactive)
exports.mine = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { seller: req.user._id };
  const [products, total] = await Promise.all([
    Product.find(filter).populate('category', 'name').sort('-createdAt').skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);
  sendSuccess(res, products, { meta: buildMeta(page, limit, total) });
});

exports.create = catchAsync(async (req, res) => {
  const data = { ...req.body };
  await assertCategory(data.category);
  if (req.user.role === 'seller') {
    data.seller = req.user._id; // a seller can only create products for themselves
  } else {
    if (!data.seller) throw new AppError('Admin must specify the seller id', 400);
    const seller = await User.findById(data.seller);
    if (!seller || seller.role !== 'seller') throw new AppError('Specified seller does not exist', 400);
  }
  const product = await Product.create(data);
  sendSuccess(res, product, { status: 201, message: 'Product created' });
});

exports.update = catchAsync(async (req, res) => {
  const product = await loadOwnedProduct(req);
  if (req.body.category) await assertCategory(req.body.category);
  Object.assign(product, req.body);
  await product.save();
  sendSuccess(res, product, { message: 'Product updated' });
});

// Inventory update: absolute value ("stock") or relative change ("adjustment"), done atomically
exports.updateStock = catchAsync(async (req, res) => {
  const product = await loadOwnedProduct(req);
  const { stock, adjustment } = req.body;

  let before;
  if (adjustment !== undefined) {
    // The $gte guard guarantees stock never becomes negative, even with concurrent updates
    before = await Product.findOneAndUpdate(
      { _id: product._id, stock: { $gte: adjustment < 0 ? -adjustment : 0 } },
      { $inc: { stock: adjustment } },
      { new: false }
    );
    if (!before) throw new AppError('Adjustment would make stock negative', 409);
  } else {
    before = await Product.findOneAndUpdate({ _id: product._id }, { $set: { stock } }, { new: false });
  }

  const updated = await Product.findById(product._id);
  emitIfLowStock(updated, before.stock);
  sendSuccess(res, updated, { message: 'Stock updated' });
});

exports.remove = catchAsync(async (req, res) => {
  const product = await loadOwnedProduct(req);
  await product.deleteOne();
  await Cart.updateMany({}, { $pull: { items: { product: product._id } } }); // clean up carts
  sendSuccess(res, null, { message: 'Product deleted' });
});
