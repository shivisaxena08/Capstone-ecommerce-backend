const { Server } = require('socket.io');
const config = require('../config/env');
const User = require('../models/User');
const { verifyAccessToken } = require('../utils/tokens');

let io = null;

/*
 * Socket.IO real-time layer.
 * Auth: client must connect with a valid JWT access token:  io(url, { auth: { token } })
 * Rooms: each socket joins "user:<id>" (private notifications) and, for admins, "role:admin".
 * Server -> client events: order:new, order:placed, order:status, stock:low   (see docs/API.md)
 */
exports.initSocket = (httpServer) => {
  io = new Server(httpServer, { cors: { origin: config.clientOrigin } });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) return next(new Error('Authentication required'));
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub).select('name role isActive');
      if (!user || !user.isActive) return next(new Error('Invalid user'));
      socket.user = { id: String(user._id), role: user.role, name: user.name };
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role, name } = socket.user;
    socket.join(`user:${id}`);
    if (role === 'admin') socket.join('role:admin');
    console.log(`[socket] connected ${name} (${role})`);
    socket.emit('connected', { userId: id, role, message: 'Real-time notifications active' });
    socket.on('disconnect', () => console.log(`[socket] disconnected ${name}`));
  });

  return io;
};

exports.getIO = () => io;
// No-ops when the socket server is not running (e.g. when running the seed script)
exports.emitToUser = (userId, event, payload) => io && io.to(`user:${userId}`).emit(event, payload);
exports.emitToRole = (role, event, payload) => io && io.to(`role:${role}`).emit(event, payload);
