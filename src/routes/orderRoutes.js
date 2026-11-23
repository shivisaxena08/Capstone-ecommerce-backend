const router = require('express').Router();
const c = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/auth');
const { validate, validateObjectId } = require('../middleware/validate');
const s = require('../validators/schemas');

router.use(protect);

router.post('/', authorize('customer'), validate(s.checkout), c.checkout);
router.get('/', validate(s.listOrdersQuery, 'query'), c.list); // scoped by role in the controller
router.get('/:id', validateObjectId('id'), c.get);
router.patch('/:id/status', authorize('seller', 'admin'), validateObjectId('id'), validate(s.updateOrderStatus), c.updateStatus);
router.post('/:id/cancel', validateObjectId('id'), validate(s.cancelOrder), c.cancel); // customer / seller / admin (ownership checked in service)

module.exports = router;
