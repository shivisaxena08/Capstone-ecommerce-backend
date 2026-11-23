const router = require('express').Router();
const c = require('../controllers/cartController');
const { protect, authorize } = require('../middleware/auth');
const { validate, validateObjectId } = require('../middleware/validate');
const s = require('../validators/schemas');

router.use(protect, authorize('customer'));

router.get('/', c.getCart);
router.post('/items', validate(s.addCartItem), c.addItem);
router.patch('/items/:productId', validateObjectId('productId'), validate(s.updateCartItem), c.updateItem);
router.delete('/items/:productId', validateObjectId('productId'), c.removeItem);
router.delete('/', c.clearCart);

module.exports = router;
