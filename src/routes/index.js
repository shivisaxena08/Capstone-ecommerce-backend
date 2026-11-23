const router = require('express').Router();

router.get('/health', (req, res) => res.json({ success: true, message: 'API is running', time: new Date().toISOString() }));
router.use('/auth', require('./authRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/categories', require('./categoryRoutes'));
router.use('/products', require('./productRoutes'));
router.use('/cart', require('./cartRoutes'));
router.use('/orders', require('./orderRoutes'));
router.use('/reports', require('./reportRoutes'));

module.exports = router;
