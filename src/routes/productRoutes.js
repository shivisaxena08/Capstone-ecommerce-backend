const router = require('express').Router();
const c = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const { validate, validateObjectId } = require('../middleware/validate');
const s = require('../validators/schemas');

// Public
router.get('/', validate(s.listProductsQuery, 'query'), c.list);

// Seller/admin (declared before "/:id" so "mine" is not treated as an id)
router.get('/mine', protect, authorize('seller'), c.mine);

router.get('/:id', validateObjectId('id'), c.get);

router.post('/', protect, authorize('seller', 'admin'), validate(s.createProduct), c.create);
router.patch('/:id', protect, authorize('seller', 'admin'), validateObjectId('id'), validate(s.updateProduct), c.update);
router.patch('/:id/stock', protect, authorize('seller', 'admin'), validateObjectId('id'), validate(s.updateStock), c.updateStock);
router.delete('/:id', protect, authorize('seller', 'admin'), validateObjectId('id'), c.remove);

module.exports = router;
