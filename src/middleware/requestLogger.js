const morgan = require('morgan');

// Logging middleware: method, URL, status, response time (+ user id when authenticated)
morgan.token('user', (req) => (req.user ? `${req.user.role}:${req.user._id}` : 'anonymous'));

module.exports = morgan(':method :url :status :response-time ms - user=:user');
