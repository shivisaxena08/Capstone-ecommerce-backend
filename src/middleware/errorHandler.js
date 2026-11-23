const config = require('../config/env');
const AppError = require('../utils/AppError');

exports.notFound = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

// Centralized error handler: every error in the app ends up here and is returned in one JSON format.
// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message;
  let errors = err.errors;

  if (err.name === 'ValidationError' && err.errors && !err.isOperational) {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    statusCode = 409;
    const fields = Object.keys(err.keyValue || {});
    message = `Duplicate value for: ${fields.join(', ')}`;
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token has expired. Please log in again or refresh your token.';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON in request body';
  }

  if (statusCode >= 500) {
    console.error('[ERROR]', err);
    if (config.nodeEnv === 'production') message = 'Internal server error';
  }

  const body = { success: false, message };
  if (errors) body.errors = errors;
  if (config.nodeEnv === 'development' && statusCode >= 500) body.stack = err.stack;
  res.status(statusCode).json(body);
};
