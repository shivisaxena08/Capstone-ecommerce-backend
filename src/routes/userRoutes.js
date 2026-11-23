const router = require('express').Router();
const c = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const { validate, validateObjectId } = require('../middleware/validate');
const s = require('../validators/schemas');

router.use(protect);

// Any logged-in user
router.get('/me', c.getMe);
router.patch('/me', validate(s.updateMe), c.updateMe);
router.patch('/me/password', validate(s.changePassword), c.changePassword);

// Admin only
router.use(authorize('admin'));
router.get('/', validate(s.listUsersQuery, 'query'), c.listUsers);
router.post('/', validate(s.adminCreateUser), c.createUser);
router.get('/:id', validateObjectId('id'), c.getUser);
router.patch('/:id', validateObjectId('id'), validate(s.adminUpdateUser), c.updateUser);
router.delete('/:id', validateObjectId('id'), c.deleteUser);

module.exports = router;
