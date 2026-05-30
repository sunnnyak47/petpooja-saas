/**
 * @fileoverview SuperAdmin Service — Platform-wide operations (facade).
 *
 * The original single large object literal was split by domain into
 * ./services/*. Each domain module augments the SAME shared singleton
 * (./services/_shared → `superadminService`) via Object.assign, preserving the
 * original self-referential interface exactly (methods still call
 * `superadminService.foo()` against one object). This facade loads every domain
 * module for its side effects, then re-exports the fully-assembled singleton so
 * existing imports of `./superadmin.service` keep working unchanged.
 *
 * JSON-blob storage in SystemConfig is intentionally preserved (not migrated to
 * dedicated tables).
 *
 * @module modules/superadmin/superadmin.service
 */

const { superadminService } = require('./services/_shared');

// Load each domain module — they Object.assign their methods onto the singleton.
require('./services/onboarding.service');
require('./services/billing.service');
require('./services/announcements.service');
require('./services/tickets.service');
require('./services/promos.service');
require('./services/analytics.service');

module.exports = superadminService;
