const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { verifyAccessToken } = require('../utils/tokens');

// Authentication: verifies the JWT access token and attaches the user to req.user
exports.protect = catchAsync(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    throw new AppError('Authentication required. Please log in.', 401);
  }
  const token = header.split(' ')[1];
  const payload = verifyAccessToken(token); // JWT errors are mapped to 401 in the error handler
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new AppError('The account for this token no longer exists or is deactivated.', 401);
  }
  req.user = user;
  next();
});

// Authorization (RBAC): allows only the listed roles
exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to perform this action.', 403));
  }
  next();
};
