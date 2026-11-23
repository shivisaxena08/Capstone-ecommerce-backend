// Consistent success response shape: { success, message?, data, meta? }
exports.sendSuccess = (res, data = null, { status = 200, message, meta } = {}) => {
  const body = { success: true };
  if (message) body.message = message;
  body.data = data;
  if (meta) body.meta = meta;
  return res.status(status).json(body);
};
