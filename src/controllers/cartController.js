const Cart = require('../models/Cart');
const Product = require('../models/Product');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/apiResponse');
const { round2 } = require('../utils/helpers');

// Builds the cart view. Prices/totals are ALWAYS computed here from current product data (server-side).
async function buildCartView(userId) {
  const cart = await Cart.findOne({ user: userId }).populate('items.product', 'name price stock isActive seller');
  const items = [];
  let total = 0;
  for (const line of cart ? cart.items : []) {
    const p = line.product;
    if (!p) continue; // product was deleted
    const lineTotal = round2(p.price * line.quantity);
    const available = p.isActive && p.stock >= line.quantity;
    if (available) total += lineTotal;
    items.push({
      product: { _id: p._id, name: p.name, seller: p.seller, stock: p.stock },
      quantity: line.quantity,
      unitPrice: p.price,
      lineTotal,
      available,
    });
  }
  return {
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    total: round2(total), // only counts items that can currently be ordered
    hasUnavailableItems: items.some((i) => !i.available),
  };
}

async function getActiveProduct(id) {
  const product = await Product.findById(id);
  if (!product || !product.isActive) throw new AppError('Product not found or unavailable', 404);
  return product;
}

exports.getCart = catchAsync(async (req, res) => sendSuccess(res, await buildCartView(req.user._id)));

exports.addItem = catchAsync(async (req, res) => {
  const { productId, quantity } = req.body;
  const product = await getActiveProduct(productId);
  const cart = (await Cart.findOne({ user: req.user._id })) || new Cart({ user: req.user._id, items: [] });
  const existing = cart.items.find((i) => String(i.product) === String(productId));
  const newQty = (existing ? existing.quantity : 0) + quantity;
  if (newQty > product.stock) {
    throw new AppError(`Only ${product.stock} unit(s) available (you have ${existing ? existing.quantity : 0} in cart)`, 409);
  }
  if (existing) existing.quantity = newQty;
  else cart.items.push({ product: productId, quantity });
  await cart.save();
  sendSuccess(res, await buildCartView(req.user._id), { status: 201, message: 'Item added to cart' });
});

exports.updateItem = catchAsync(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  const item = cart && cart.items.find((i) => String(i.product) === req.params.productId);
  if (!item) throw new AppError('Item not found in cart', 404);
  const product = await getActiveProduct(req.params.productId);
  if (req.body.quantity > product.stock) throw new AppError(`Only ${product.stock} unit(s) available`, 409);
  item.quantity = req.body.quantity;
  await cart.save();
  sendSuccess(res, await buildCartView(req.user._id), { message: 'Cart updated' });
});

exports.removeItem = catchAsync(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart || !cart.items.some((i) => String(i.product) === req.params.productId)) {
    throw new AppError('Item not found in cart', 404);
  }
  cart.items = cart.items.filter((i) => String(i.product) !== req.params.productId);
  await cart.save();
  sendSuccess(res, await buildCartView(req.user._id), { message: 'Item removed' });
});

exports.clearCart = catchAsync(async (req, res) => {
  await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } });
  sendSuccess(res, await buildCartView(req.user._id), { message: 'Cart cleared' });
});
