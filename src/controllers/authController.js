const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/apiResponse');
const {
  signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, tokenExpiryDate,
} = require('../utils/tokens');

// Creates an access/refresh token pair and stores the HASH of the refresh token (max 5 sessions per user)
async function issueTokens(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  await User.updateOne({ _id: user._id }, { $pull: { refreshTokens: { expiresAt: { $lt: new Date() } } } });
  await User.updateOne(
    { _id: user._id },
    {
      $push: {
        refreshTokens: {
          $each: [{ tokenHash: hashToken(refreshToken), expiresAt: tokenExpiryDate(refreshToken) }],
          $slice: -5,
        },
      },
    }
  );
  return { accessToken, refreshToken };
}

exports.register = catchAsync(async (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (await User.exists({ email })) throw new AppError('Email is already registered', 409);
  const user = await User.create({ name, email, password, role, phone });
  const tokens = await issueTokens(user);
  sendSuccess(res, { user, ...tokens }, { status: 201, message: 'Registration successful' });
});

exports.login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  // Same message for unknown email / wrong password -> prevents user enumeration
  if (!user || !(await user.comparePassword(password))) throw new AppError('Invalid email or password', 401);
  if (!user.isActive) throw new AppError('Your account has been deactivated', 403);
  const tokens = await issueTokens(user);
  sendSuccess(res, { user, ...tokens }, { message: 'Login successful' });
});

// Refresh-token ROTATION: each refresh token can be used once. Presenting an already-used (or
// logged-out) token is treated as theft -> all sessions of that user are revoked.
exports.refresh = catchAsync(async (req, res) => {
  const { refreshToken } = req.body;
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }
  const hash = hashToken(refreshToken);
  const user = await User.findOneAndUpdate(
    { _id: payload.sub, 'refreshTokens.tokenHash': hash },
    { $pull: { refreshTokens: { tokenHash: hash } } },
    { new: true }
  );
  if (!user) {
    await User.updateOne({ _id: payload.sub }, { $set: { refreshTokens: [] } });
    throw new AppError('Refresh token has been revoked. Please log in again.', 401);
  }
  if (!user.isActive) throw new AppError('Your account has been deactivated', 401);
  const tokens = await issueTokens(user);
  sendSuccess(res, tokens, { message: 'Token refreshed' });
});

// Logout = invalidate the refresh token (access token simply expires, it is short-lived)
exports.logout = catchAsync(async (req, res) => {
  try {
    const payload = verifyRefreshToken(req.body.refreshToken);
    await User.updateOne({ _id: payload.sub }, { $pull: { refreshTokens: { tokenHash: hashToken(req.body.refreshToken) } } });
  } catch {
    /* already invalid -> nothing to revoke; logout stays idempotent */
  }
  sendSuccess(res, null, { message: 'Logged out' });
});

exports.logoutAll = catchAsync(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $set: { refreshTokens: [] } });
  sendSuccess(res, null, { message: 'Logged out from all devices' });
});
