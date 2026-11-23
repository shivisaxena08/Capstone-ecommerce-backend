const http = require('http');
const mongoose = require('mongoose');
const config = require('./src/config/env');
const connectDB = require('./src/config/db');
const app = require('./src/app');
const { initSocket } = require('./src/sockets');
const registerListeners = require('./src/events/listeners');

(async () => {
  await connectDB();

  const server = http.createServer(app);
  initSocket(server); // Socket.IO shares the same HTTP server
  registerListeners(); // EventEmitter listeners

  server.listen(config.port, () => {
    console.log(`Server running in ${config.nodeEnv} mode on http://localhost:${config.port}`);
    console.log(`Socket.IO demo page: http://localhost:${config.port}/socket-demo.html`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received, shutting down...`);
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
})().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});
