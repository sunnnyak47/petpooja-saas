/**
 * @fileoverview Documents controller — HTTP handlers for licenses & files.
 * Uploads reuse the same durable-storage + local-disk fallback strategy as the
 * head-office logo upload (config/storage.uploadFile → catch → ./uploads).
 * @module modules/documents/documents.controller
 */

'use strict';

const documents = require('./documents.service');
const { uploadFile } = require('../../config/storage');
const { sendSuccess, sendCreated, sendError } = require('../../utils/response');
const logger = require('../../config/logger');

/** GET /api/documents?outlet_id= */
async function list(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    if (!outletId) return sendError(res, 400, 'outlet_id required');
    const items = await documents.listDocuments(outletId);
    sendSuccess(res, items, 'Documents retrieved');
  } catch (error) { next(error); }
}

/**
 * POST /api/documents — multipart: file + name + category + expires_at.
 * Stores the file (Supabase/S3 with a local-disk fallback) then writes a
 * Document row pointing at the resulting public URL.
 */
async function create(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    if (!outletId) return sendError(res, 400, 'outlet_id required');
    if (!req.file) return sendError(res, 400, 'No file uploaded');

    const { name, category, expires_at } = req.body;

    // 1) Store the binary. Prefer durable storage; fall back to local disk so
    //    the feature still works in local dev without S3/Supabase configured.
    let file_url;
    try {
      const stored = await uploadFile(
        req.file.buffer,
        req.file.originalname,
        'documents',
        req.file.mimetype
      );
      file_url = stored.url;
    } catch (storageError) {
      const fs = require('fs');
      const path = require('path');
      const { v4: uuidv4 } = require('uuid');
      const uploadDir = path.join(__dirname, '../../../uploads/documents');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const ext = path.extname(req.file.originalname).toLowerCase() || '';
      const filename = `${uuidv4()}${ext}`;
      fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
      file_url = `${req.protocol}://${req.get('host')}/uploads/documents/${filename}`;
      logger.warn('Durable document upload failed, saved locally', {
        filename, error: storageError.message,
      });
    }

    // 2) Record the row.
    const doc = await documents.createDocument({
      outletId,
      name,
      category,
      file_url,
      file_type: req.file.mimetype || null,
      file_size: req.file.size || null,
      expires_at: expires_at || null,
      uploaded_by: req.user.id,
    });

    sendCreated(res, doc, 'Document uploaded');
  } catch (error) { next(error); }
}

/** DELETE /api/documents/:id — soft delete, outlet-scoped. */
async function remove(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    if (!outletId) return sendError(res, 400, 'outlet_id required');
    const result = await documents.deleteDocument(outletId, req.params.id);
    sendSuccess(res, result, 'Document deleted');
  } catch (error) { next(error); }
}

module.exports = { list, create, remove };
