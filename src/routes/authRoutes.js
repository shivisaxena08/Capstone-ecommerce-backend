const router = require('express').Router();
const c = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const s = require('../validators/schemas');

router.post('/register', validate(s.register), c.register);
router.post('/login', validate(s.login), c.login);
router.post('/refresh', validate(s.refresh), c.refresh);
router.post('/logout', validate(s.refresh), c.logout);
router.post('/logout-all', protect, c.logoutAll);

module.exports = router;
