const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config/env');
const requestLogger = require('./middleware/requestLogger');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

app.use(helmet({ contentSecurityPolicy: false })); // CSP off only so the small Socket.IO demo page can use inline JS
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '10kb' }));
app.use(requestLogger);

// Brute-force protection on auth endpoints
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' } }));

app.use(express.static(path.join(__dirname, '..', 'public'))); // /socket-demo.html
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
