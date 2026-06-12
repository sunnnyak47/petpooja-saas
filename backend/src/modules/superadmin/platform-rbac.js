/**
 * @fileoverview Single source of truth for SuperAdmin (platform-level) RBAC.
 *
 * The platform is operated by a small team of staff. Each staff member is a
 * `User` row with `head_office_id = NULL` linked (via `UserRole`, `outlet_id = NULL`)
 * to exactly one PLATFORM role. `super_admin` is the founder/god account; the
 * other roles are scoped presets so access can be handed to employees safely.
 *
 * Permissions are coarse-grained by functional area. Most areas use a single
 * key; chains and billing split view/manage because partial access is common
 * (e.g. support staff can view chains but not suspend them).
 *
 * This module is pure data + helpers (no app deps) so it can be required from
 * the seed script, the login service, and auth middleware without cycles.
 * @module modules/superadmin/platform-rbac
 */

/** Permission catalog — seeded into the `permissions` table (module = 'platform'). */
const PLATFORM_PERMISSIONS = [
  { key: 'sa.dashboard.view', display_name: 'View dashboards & analytics', description: 'Platform dashboard, live stats, menu analytics' },
  { key: 'sa.chains.view',    display_name: 'View restaurant chains',       description: 'Browse chains, outlets, onboarding status, user directory' },
  { key: 'sa.chains.manage',  display_name: 'Manage restaurant chains',     description: 'Onboard, suspend/activate, edit profile, region, features, plan, reset owner login' },
  { key: 'sa.impersonate',    display_name: 'Impersonate owners',           description: 'Log in as a chain owner for support' },
  { key: 'sa.billing.view',   display_name: 'View billing & revenue',       description: 'Invoices, revenue, tax profiles (read-only)' },
  { key: 'sa.billing.manage', display_name: 'Manage billing',              description: 'Generate/edit invoices, edit tax profiles, plans' },
  { key: 'sa.support.manage', display_name: 'Manage support',              description: 'Support tickets, broadcasts, announcements' },
  { key: 'sa.promos.manage',  display_name: 'Manage promo codes',          description: 'Create, edit, disable promo codes' },
  { key: 'sa.settings.manage', display_name: 'Manage platform settings',   description: 'Global platform configuration' },
  { key: 'sa.audit.view',     display_name: 'View audit trail & health',   description: 'Platform audit log, health monitor, impersonation log' },
  { key: 'sa.staff.manage',   display_name: 'Manage platform staff',       description: 'Create platform staff, assign roles, reset their logins' },
];

const ALL_PERMISSION_KEYS = PLATFORM_PERMISSIONS.map((p) => p.key);

/**
 * Platform roles + their preset permission grants.
 * `super_admin` is granted everything (and also bypasses permission checks in
 * middleware), but we still seed its grants so the management UI can render them.
 */
const PLATFORM_ROLE_DEFS = [
  {
    name: 'super_admin',
    display_name: 'Super Admin',
    description: 'Platform owner — full access to everything, including staff management.',
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    name: 'platform_admin',
    display_name: 'Platform Admin',
    description: 'Day-to-day operations: chains, support, promos, impersonation. No billing edits, settings, or staff management.',
    permissions: [
      'sa.dashboard.view', 'sa.chains.view', 'sa.chains.manage', 'sa.impersonate',
      'sa.billing.view', 'sa.support.manage', 'sa.promos.manage', 'sa.audit.view',
    ],
  },
  {
    name: 'platform_support',
    display_name: 'Support Agent',
    description: 'Help chains: view chains, impersonate, handle tickets/broadcasts. Read-only elsewhere.',
    permissions: [
      'sa.dashboard.view', 'sa.chains.view', 'sa.impersonate', 'sa.support.manage', 'sa.audit.view',
    ],
  },
  {
    name: 'platform_billing',
    display_name: 'Billing Manager',
    description: 'Owns invoicing, revenue, and tax profiles. View-only on chains.',
    permissions: [
      'sa.dashboard.view', 'sa.chains.view', 'sa.billing.view', 'sa.billing.manage', 'sa.audit.view',
    ],
  },
  {
    name: 'platform_readonly',
    display_name: 'Read Only',
    description: 'View-only access to dashboards, chains, billing, and audit trail. Cannot change anything.',
    permissions: [
      'sa.dashboard.view', 'sa.chains.view', 'sa.billing.view', 'sa.audit.view',
    ],
  },
];

/** Role names that are allowed to log into the SuperAdmin console. */
const PLATFORM_ROLES = PLATFORM_ROLE_DEFS.map((r) => r.name);

/** Roles that can be ASSIGNED to staff (super_admin is intentionally assignable too). */
const ASSIGNABLE_PLATFORM_ROLES = PLATFORM_ROLE_DEFS.map((r) => ({
  name: r.name,
  display_name: r.display_name,
  description: r.description,
  permissions: r.permissions,
}));

/** @param {string} roleName @returns {boolean} */
function isPlatformRole(roleName) {
  return PLATFORM_ROLES.includes(roleName);
}

/** @param {string} roleName @returns {string[]} permission keys for that role (empty if unknown). */
function permissionsForRole(roleName) {
  const def = PLATFORM_ROLE_DEFS.find((r) => r.name === roleName);
  return def ? [...def.permissions] : [];
}

module.exports = {
  PLATFORM_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  PLATFORM_ROLE_DEFS,
  PLATFORM_ROLES,
  ASSIGNABLE_PLATFORM_ROLES,
  isPlatformRole,
  permissionsForRole,
};
