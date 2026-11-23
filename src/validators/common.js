const Joi = require('joi');

exports.objectId = Joi.string().hex().length(24);

exports.password = Joi.string()
  .min(8)
  .max(72)
  .pattern(/[A-Za-z]/, 'letter')
  .pattern(/\d/, 'number')
  .messages({
    'string.pattern.name': 'Password must contain at least one letter and one number',
  });

exports.address = Joi.object({
  line1: Joi.string().trim().max(200),
  line2: Joi.string().trim().max(200).allow(''),
  city: Joi.string().trim().max(80),
  state: Joi.string().trim().max(80),
  postalCode: Joi.string().trim().max(20),
  country: Joi.string().trim().max(80),
});

exports.pageQuery = {
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
};
