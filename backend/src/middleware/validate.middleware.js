/**
 * @fileoverview Joi validation middleware.
 * Wraps Joi schema validation into reusable Express middleware.
 * @module middleware/validate
 */

const { BadRequestError } = require('../utils/errors');

/**
 * Middleware factory: validates req.body, req.query, or req.params against a Joi schema.
 * @param {import('joi').ObjectSchema} schema - Joi validation schema
 * @param {'body'|'query'|'params'} [source='body'] - Request property to validate
 * @returns {import('express').RequestHandler}
 * @example
 * router.post('/login', validate(loginSchema, 'body'), controller);
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const dataToValidate = req[source];

      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false,
        stripUnknown: true,
        allowUnknown: false,
      });

      if (error) {
        const messages = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message.replace(/"/g, ''),
        }));

        const errorMessage = messages.map((m) => `${m.field}: ${m.message}`).join('; ');
        const err = new BadRequestError(`Validation failed: ${errorMessage}`);
        err.validationErrors = messages;
        throw err;
      }

      req[source] = value;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { validate };
