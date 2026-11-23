const router = require('express').Router();
const c = require('../controllers/categoryController');
const { protect, authorize } = require('../middleware/auth');
const { validate, validateObjectId } = require('../middleware/validate');
const s = require('../validators/schemas');

router.get('/', c.list);
router.get('/:id', validateObjectId('id'), c.get);

router.use(protect, authorize('admin'));
router.post('/', validate(s.createCategory), c.create);
router.patch('/:id', validateObjectId('id'), validate(s.updateCategory), c.update);
router.delete('/:id', validateObjectId('id'), c.remove);

module.exports = router;
