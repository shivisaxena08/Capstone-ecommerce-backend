const mongoose = require('mongoose');
const config = require('../config/env');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Product name is required'], trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    price: { type: Number, required: [true, 'Price is required'], min: [0, 'Price cannot be negative'] },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stock: {
      type: Number,
      required: true,
      min: [0, 'Stock cannot be negative'],
      default: 0,
      validate: { validator: Number.isInteger, message: 'Stock must be a whole number' },
    },
    lowStockThreshold: { type: Number, min: 0, default: () => config.lowStockThreshold },
    images: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* ---------------- Indexes ----------------
 * 1. Text index  -> powers keyword search (GET /api/products?q=...)
 * 2. {seller, category} compound -> "my products" listing and per-seller reports
 * 3. {category, price} compound  -> category browsing sorted/filtered by price
 */
productSchema.index({ name: 'text', description: 'text' }, { weights: { name: 5, description: 1 } });
productSchema.index({ seller: 1, category: 1 });
productSchema.index({ category: 1, price: 1 });

productSchema.virtual('isLowStock').get(function () {
  return this.stock <= this.lowStockThreshold;
});

productSchema.set('toJSON', { virtuals: true, transform: (d, ret) => { delete ret.id; delete ret.__v; return ret; } });

module.exports = mongoose.model('Product', productSchema);
