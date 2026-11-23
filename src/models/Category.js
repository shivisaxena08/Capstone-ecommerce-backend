const mongoose = require('mongoose');
const { slugify } = require('../utils/helpers');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Category name is required'], unique: true, trim: true, minlength: 2, maxlength: 60 },
    slug: { type: String, unique: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

categorySchema.pre('validate', function (next) {
  if (this.isModified('name')) this.slug = slugify(this.name);
  next();
});

module.exports = mongoose.model('Category', categorySchema);
