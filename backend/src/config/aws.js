/**
 * @fileoverview AWS S3 and CloudFront configuration.
 * Provides S3 client, upload helper, and signed URL generation.
 * @module config/aws
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const logger = require('./logger');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || 'petpooja-erp-assets';
const CDN_URL = process.env.AWS_CLOUDFRONT_URL || '';

/**
 * Uploads a file buffer to S3 and returns the CDN or S3 URL.
 * Generates a unique key based on folder and original filename.
 * @param {Buffer} fileBuffer - The file content as a Buffer
 * @param {string} originalName - Original filename for extension detection
 * @param {string} folder - S3 folder path (e.g., 'menu-images', 'receipts')
 * @param {string} [contentType='application/octet-stream'] - MIME type of the file
 * @returns {Promise<{key: string, url: string}>} The S3 key and public URL
 */
async function uploadToS3(fileBuffer, originalName, folder, contentType = 'application/octet-stream') {
  try {
    const ext = path.extname(originalName).toLowerCase();
    const key = `${folder}/${uuidv4()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      CacheControl: 'max-age=31536000',
    });

    await s3Client.send(command);

    const url = CDN_URL ? `${CDN_URL}/${key}` : `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    logger.info('File uploaded to S3', { key, folder, size: fileBuffer.length });
    return { key, url };
  } catch (error) {
    logger.error('S3 upload failed', { error: error.message, folder, originalName });
    throw error;
  }
}

/**
 * Deletes a file from S3 by its key.
 * @param {string} key - The S3 object key to delete
 * @returns {Promise<void>}
 */
async function deleteFromS3(key) {
  try {
    const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
    await s3Client.send(command);
    logger.info('File deleted from S3', { key });
  } catch (error) {
    logger.error('S3 delete failed', { error: error.message, key });
    throw error;
  }
}

/**
 * Generates a pre-signed URL for temporary private access.
 * @param {string} key - The S3 object key
 * @param {number} [expiresIn=3600] - URL expiry in seconds (default 1 hour)
 * @returns {Promise<string>} The pre-signed URL
 */
async function getPresignedUrl(key, expiresIn = 3600) {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    logger.error('Presigned URL generation failed', { error: error.message, key });
    throw error;
  }
}

module.exports = { s3Client, uploadToS3, deleteFromS3, getPresignedUrl, BUCKET };
