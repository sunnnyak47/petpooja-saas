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

/**
 * Normalise a phone number to the canonical form stored in the DB so the same
 * number always compares equal regardless of how it was typed. Strips spaces /
 * brackets / dashes / dots, then reduces common Indian-mobile presentations
 * (+91…, 91…, or a leading 0) to the bare 10-digit form that the rest of the app
 * (registration, login-by-phone, customer lookup) already uses. Australian
 * numbers (+61… / 0X landlines) are left untouched. Non-phone input is returned
 * stripped-only, so PHONE_REGEX still rejects it.
 * @param {*} value
 * @returns {string}
 */
function canonicalizePhone(value) {
  const stripped = String(value == null ? '' : value).replace(/[\s()\-.]/g, '');
  if (/^\+?91[6-9]\d{9}$/.test(stripped)) return stripped.replace(/^\+?91/, ''); // +91 / 91 prefix
  if (/^0[6-9]\d{9}$/.test(stripped))     return stripped.slice(1);              // leading 0 on IN mobile
  return stripped;
}

// Canonicalise first (handles "+91 98765 43210", "098765 43210", "+61 412 345 678"),
// then validate the normalised value and emit it as the field's output so what
// gets stored is consistent across every entry point.
function phoneRule(value, helpers) {
  const v = canonicalizePhone(value);
  if (!PHONE_REGEX.test(v)) return helpers.error('string.pattern.base');
  return v;
}

const phoneRequired = Joi.string().trim().required().custom(phoneRule)
  .messages({ 'string.pattern.base': PHONE_MESSAGE });

const phoneOptional = Joi.string().trim().allow('', null).custom(phoneRule)
  .messages({ 'string.pattern.base': PHONE_MESSAGE });

const emailRequired = Joi.string().trim().lowercase().email().max(150).required();
const emailOptional = Joi.string().trim().lowercase().email().max(150).allow('', null);

module.exports = { PHONE_REGEX, canonicalizePhone, phoneRequired, phoneOptional, emailRequired, emailOptional };
