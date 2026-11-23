const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');

// Short-lived access token (sent in the Authorization header)
exports.signAccessToken = (user) =>
  jwt.sign({ role: user.role }, config.jwt.accessSecret, {
    subject: String(user._id),
    expiresIn: config.jwt.accessExpires,
  });

// Long-lived refresh token (used only to obtain new access tokens). jti makes every token unique.
exports.signRefreshToken = (user) =>
  jwt.sign({ jti: crypto.randomUUID() }, config.jwt.refreshSecret, {
    subject: String(user._id),
    expiresIn: config.jwt.refreshExpires,
  });

exports.verifyAccessToken = (token) => jwt.verify(token, config.jwt.accessSecret);
exports.verifyRefreshToken = (token) => jwt.verify(token, config.jwt.refreshSecret);

// Refresh tokens are stored hashed (SHA-256) so a DB leak does not leak usable tokens.
exports.hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
exports.tokenExpiryDate = (token) => new Date(jwt.decode(token).exp * 1000);
