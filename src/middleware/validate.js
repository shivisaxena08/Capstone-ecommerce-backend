const mongoose = require('mongoose');
const AppError = require('../utils/AppError');

// Validates req[source] (body | query | params) against a Joi schema; replaces it with the sanitized value.
exports.validate = (schema, source = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    const details = error.details.map((d) => ({
      field: d.path.join('.'),
      message: d.message.replace(/"/g, ''),
    }));
    return next(new AppError('Validation failed', 400, details));
  }
  req[source] = value;
  next();
};

// Rejects malformed MongoDB ObjectIds in route params with a 400 instead of a CastError
exports.validateObjectId = (...params) => (req, res, next) => {
  for (const p of params) {
    if (!mongoose.isValidObjectId(req.params[p])) {
      return next(new AppError(`Invalid ${p}`, 400, [{ field: p, message: 'Must be a valid ObjectId' }]));
    }
  }
  next();
};
