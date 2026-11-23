const crypto = require('crypto');

exports.round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

exports.generateOrderNumber = () =>
  `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

exports.slugify = (text) =>
  String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
