const { body } = require('express-validator');

const chatValidator = [
  body('message').optional({ values: 'falsy' }).trim().isLength({ min: 1, max: 4000 }).withMessage('Message must be between 1 and 4000 characters'),
  body('conversationId').optional({ values: 'falsy' }).isString().isLength({ min: 1, max: 120 }).withMessage('Conversation ID must be a valid string'),
];

module.exports = {
  chatValidator,
};
