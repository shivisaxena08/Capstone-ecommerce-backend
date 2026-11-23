const router = require('express').Router();
const c = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const s = require('../validators/schemas');

router.use(protect, authorize('seller', 'admin'));

router.get('/sales-summary', validate(s.reportQuery, 'query'), c.salesSummary);
router.get('/best-selling', validate(s.reportQuery, 'query'), c.bestSelling);
router.get('/inventory-summary', c.inventorySummary);
router.get('/low-stock', c.lowStock);
router.get('/order-status', validate(s.reportQuery, 'query'), c.orderStatusBreakdown);

module.exports = router;
