const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/apiResponse');
const { getPagination, buildMeta } = require('../utils/pagination');

exports.getMe = (req, res) => sendSuccess(res, req.user);

exports.updateMe = catchAsync(async (req, res) => {
  // Only whitelisted profile fields (role / isActive / email can NOT be changed here)
  const user = await User.findByIdAndUpdate(req.user._id, { $set: req.body }, { new: true, runValidators: true });
  sendSuccess(res, user, { message: 'Profile updated' });
});

exports.changePassword = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) {
    throw new AppError('Current password is incorrect', 401);
  }
  user.password = req.body.newPassword; // re-hashed by the pre-save hook
  user.refreshTokens = []; // force re-login everywhere
  await user.save();
  sendSuccess(res, null, { message: 'Password changed. Please log in again.' });
});

// ----- admin -----
exports.listUsers = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive;
  if (req.query.q) {
    const rx = new RegExp(req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort('-createdAt').skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  sendSuccess(res, users, { meta: buildMeta(page, limit, total) });
});

exports.getUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  sendSuccess(res, user);
});

exports.createUser = catchAsync(async (req, res) => {
  if (await User.exists({ email: req.body.email })) throw new AppError('Email is already registered', 409);
  const user = await User.create(req.body);
  sendSuccess(res, user, { status: 201, message: 'User created' });
});

exports.updateUser = catchAsync(async (req, res) => {
  if (String(req.params.id) === String(req.user._id) && (req.body.role || req.body.isActive === false)) {
    throw new AppError('You cannot change your own role or deactivate yourself', 400);
  }
  const user = await User.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  if (!user) throw new AppError('User not found', 404);
  if (req.body.isActive === false) await User.updateOne({ _id: user._id }, { $set: { refreshTokens: [] } });
  sendSuccess(res, user, { message: 'User updated' });
});

exports.deleteUser = catchAsync(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw new AppError('You cannot delete your own account', 400);
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  sendSuccess(res, null, { message: 'User deleted' });
});
