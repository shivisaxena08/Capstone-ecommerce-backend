const Joi = require('joi');
const { objectId, password, address, pageQuery } = require('./common');

// ---------- auth ----------
exports.register = Joi.object({
  name: Joi.string().trim().min(2).max(60).required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: password.required(),
  role: Joi.string().valid('customer', 'seller').default('customer'), // admins cannot self-register
  phone: Joi.string().trim().max(20),
});
exports.login = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().required(),
});
exports.refresh = Joi.object({ refreshToken: Joi.string().required() });

// ---------- users ----------
exports.updateMe = Joi.object({
  name: Joi.string().trim().min(2).max(60),
  phone: Joi.string().trim().max(20).allow(''),
  address,
}).min(1);
exports.changePassword = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: password.required(),
});
exports.adminCreateUser = Joi.object({
  name: Joi.string().trim().min(2).max(60).required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: password.required(),
  role: Joi.string().valid('customer', 'seller', 'admin').required(),
  phone: Joi.string().trim().max(20),
});
exports.adminUpdateUser = Joi.object({
  name: Joi.string().trim().min(2).max(60),
  role: Joi.string().valid('customer', 'seller', 'admin'),
  isActive: Joi.boolean(),
  phone: Joi.string().trim().max(20).allow(''),
}).min(1);
exports.listUsersQuery = Joi.object({
  ...pageQuery,
  role: Joi.string().valid('customer', 'seller', 'admin'),
  isActive: Joi.boolean(),
  q: Joi.string().trim().max(60),
});

// ---------- categories ----------
exports.createCategory = Joi.object({
  name: Joi.string().trim().min(2).max(60).required(),
  description: Joi.string().trim().max(500).allow(''),
});
exports.updateCategory = Joi.object({
  name: Joi.string().trim().min(2).max(60),
  description: Joi.string().trim().max(500).allow(''),
  isActive: Joi.boolean(),
}).min(1);

// ---------- products ----------
exports.createProduct = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  description: Joi.string().trim().max(2000).allow(''),
  price: Joi.number().min(0).precision(2).required(),
  category: objectId.required(),
  stock: Joi.number().integer().min(0).required(),
  lowStockThreshold: Joi.number().integer().min(0),
  images: Joi.array().items(Joi.string().uri()).max(8),
  seller: objectId, // admin only: which seller owns the product
});
exports.updateProduct = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  description: Joi.string().trim().max(2000).allow(''),
  price: Joi.number().min(0).precision(2),
  category: objectId,
  lowStockThreshold: Joi.number().integer().min(0),
  images: Joi.array().items(Joi.string().uri()).max(8),
  isActive: Joi.boolean(),
}).min(1);
exports.updateStock = Joi.object({
  stock: Joi.number().integer().min(0),
  adjustment: Joi.number().integer().not(0), // e.g. +20 (restock) or -3 (damaged)
}).xor('stock', 'adjustment');
exports.listProductsQuery = Joi.object({
  ...pageQuery,
  q: Joi.string().trim().max(100),
  category: objectId,
  seller: objectId,
  minPrice: Joi.number().min(0),
  maxPrice: Joi.number().min(0),
  inStock: Joi.boolean(),
  sort: Joi.string().valid('price', '-price', 'name', '-name', 'createdAt', '-createdAt').default('-createdAt'),
});

// ---------- cart ----------
exports.addCartItem = Joi.object({
  productId: objectId.required(),
  quantity: Joi.number().integer().min(1).max(100).default(1),
});
exports.updateCartItem = Joi.object({ quantity: Joi.number().integer().min(1).max(100).required() });

// ---------- orders ----------
exports.checkout = Joi.object({
  shippingAddress: Joi.object({
    fullName: Joi.string().trim().min(2).max(80).required(),
    phone: Joi.string().trim().min(7).max(20).required(),
    line1: Joi.string().trim().max(200).required(),
    line2: Joi.string().trim().max(200).allow(''),
    city: Joi.string().trim().max(80).required(),
    state: Joi.string().trim().max(80).required(),
    postalCode: Joi.string().trim().max(20).required(),
    country: Joi.string().trim().max(80).default('India'),
  }).required(),
  paymentMethod: Joi.string().valid('COD', 'SIMULATED_CARD').default('COD'),
});
exports.updateOrderStatus = Joi.object({
  status: Joi.string().valid('confirmed', 'shipped', 'delivered', 'cancelled').required(),
  note: Joi.string().trim().max(300),
});
exports.cancelOrder = Joi.object({ note: Joi.string().trim().max(300) });
exports.listOrdersQuery = Joi.object({
  ...pageQuery,
  status: Joi.string().valid('pending', 'confirmed', 'shipped', 'delivered', 'cancelled'),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
});

// ---------- reports ----------
exports.reportQuery = Joi.object({
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  groupBy: Joi.string().valid('day', 'month').default('day'),
  limit: Joi.number().integer().min(1).max(50).default(5),
});
