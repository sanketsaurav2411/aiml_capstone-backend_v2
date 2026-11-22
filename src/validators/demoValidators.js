const { body } = require('express-validator');

const demoRequestValidator = [
  body('name').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('mobile').optional({ values: 'falsy' }).trim().isLength({ min: 6, max: 30 }).withMessage('Mobile number must be valid'),
  body('company').optional({ values: 'falsy' }).trim().isLength({ min: 1, max: 150 }).withMessage('Company must be between 1 and 150 characters'),
  body('message').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 1000 }).withMessage('Message must be between 2 and 1000 characters'),
];

module.exports = {
  demoRequestValidator,
};
