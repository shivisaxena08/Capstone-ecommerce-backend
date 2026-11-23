const Category = require('../models/Category');
const Product = require('../models/Product');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/apiResponse');

exports.list = catchAsync(async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort('name');
  sendSuccess(res, categories);
});

exports.get = catchAsync(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new AppError('Category not found', 404);
  sendSuccess(res, category);
});

exports.create = catchAsync(async (req, res) => {
  const category = await Category.create(req.body);
  sendSuccess(res, category, { status: 201, message: 'Category created' });
});

exports.update = catchAsync(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new AppError('Category not found', 404);
  Object.assign(category, req.body);
  await category.save(); // save() so the slug hook runs
  sendSuccess(res, category, { message: 'Category updated' });
});

exports.remove = catchAsync(async (req, res) => {
  if (await Product.exists({ category: req.params.id })) {
    throw new AppError('Cannot delete a category that still has products', 409);
  }
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) throw new AppError('Category not found', 404);
  sendSuccess(res, null, { message: 'Category deleted' });
});
