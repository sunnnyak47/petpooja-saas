/**
 * @fileoverview Shared Joi field validators for phone + email so every module
 * enforces the same rules. Phone accepts Australian numbers (+61 / 0X landline /
 * mobile) and, for multi-region support, Indian 10-digit mobiles — identical to
 * the regex used by auth.validation.
 * @module utils/validators
 */
const Joi = require('joi');

// +61 + 9 digits | 0X (area 2-9) + 8 digits | 10-digit mobile (6-9 start)
const PHONE_REGEX = /^(\+?61[0-9]{9}|0[2-9][0-9]{8}|[6-9][0-9]{9})$/;

const PHONE_MESSAGE = 'Enter a valid phone number (e.g. +61 412345678, 0X… landline, or a 10-digit mobile)';

// .replace() strips spaces/dashes/brackets so a formatted "+61 412 345 678"
// validates the same as "+61412345678" (matches the frontend's normalisePhone).
const phoneRequired = Joi.string().trim().replace(/[\s()\-.]/g, '').pattern(PHONE_REGEX).required()
  .messages({ 'string.pattern.base': PHONE_MESSAGE });

const phoneOptional = Joi.string().trim().replace(/[\s()\-.]/g, '').pattern(PHONE_REGEX).allow('', null)
  .messages({ 'string.pattern.base': PHONE_MESSAGE });

const emailRequired = Joi.string().trim().lowercase().email().max(150).required();
const emailOptional = Joi.string().trim().lowercase().email().max(150).allow('', null);

module.exports = { PHONE_REGEX, phoneRequired, phoneOptional, emailRequired, emailOptional };
