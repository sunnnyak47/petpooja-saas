/**
 * @fileoverview Mail service — handles sending system emails.
 * Currently mocks sending by logging to console as requested.
 * @module utils/mail.service
 */

const logger = require('../config/logger');

/**
 * Sends a password reset email.
 * @param {string} email - Recipient email
 * @param {string} resetLink - Link with reset token
 * @returns {Promise<void>}
 */
async function sendPasswordResetEmail(email, resetLink) {
  try {
    // In production, this would use a transporter like Nodemailer with SendGrid/SMTP
    logger.info('📧 MOCK EMAIL SENT:', {
      to: email,
      subject: 'Reset Your Petpooja ERP Password',
      content: `Use the following link to reset your password: ${resetLink}`,
      timestamp: new Date().toISOString()
    });

    // Also log explicitly for the user to see in dev logs
    console.log(`\n================================================\n`);
    console.log(`📧  RESET EMAIL SENT TO: ${email}`);
    console.log(`🔗  LINK: ${resetLink}`);
    console.log(`\n================================================\n`);
  } catch (error) {
    logger.error('Failed to send password reset email', { error: error.message, email });
    throw error;
  }
}

module.exports = {
  sendPasswordResetEmail
};
