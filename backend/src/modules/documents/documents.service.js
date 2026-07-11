/**
 * @fileoverview Documents service — pure DB access for the Document model
 * (licenses & files). Everything is scoped by outlet_id + is_deleted:false.
 * @module modules/documents/documents.service
 */

'use strict';

const { getDbClient } = require('../../config/database');
const { NotFoundError } = require('../../utils/errors');
const logger = require('../../config/logger');

/**
 * List all non-deleted documents for an outlet, newest first, grouped-friendly
 * (ordered by category then created_at so the client can section them cheaply).
 * @param {string} outletId
 * @returns {Promise<Array>}
 */
async function listDocuments(outletId) {
  const prisma = getDbClient();
  return prisma.document.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    orderBy: [{ category: 'asc' }, { created_at: 'desc' }],
  });
}

/**
 * Persist a Document row after the file has been stored.
 * @param {object} params
 * @returns {Promise<object>} the created Document
 */
async function createDocument({
  outletId,
  name,
  category,
  file_url,
  file_type,
  file_size,
  expires_at,
  uploaded_by,
}) {
  const prisma = getDbClient();
  const doc = await prisma.document.create({
    data: {
      outlet_id: outletId,
      name: String(name).trim(),
      category: category || 'Other',
      file_url,
      file_type: file_type || null,
      file_size: file_size != null ? Number(file_size) : null,
      expires_at: expires_at ? new Date(expires_at) : null,
      uploaded_by: uploaded_by || null,
    },
  });
  logger.info('Document created', { id: doc.id, outlet_id: outletId, category: doc.category });
  return doc;
}

/**
 * Soft-delete a document, scoped to its outlet so one outlet cannot delete
 * another's files.
 * @param {string} outletId
 * @param {string} id
 * @returns {Promise<{deleted:boolean}>}
 */
async function deleteDocument(outletId, id) {
  const prisma = getDbClient();
  const existing = await prisma.document.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Document not found');

  await prisma.document.update({
    where: { id },
    data: { is_deleted: true },
  });
  logger.info('Document deleted', { id, outlet_id: outletId });
  return { deleted: true };
}

module.exports = { listDocuments, createDocument, deleteDocument };
