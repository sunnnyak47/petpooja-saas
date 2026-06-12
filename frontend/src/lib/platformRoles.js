/**
 * Platform (SuperAdmin) role helpers for the UI shell.
 *
 * The backend is the real authorization boundary — every /superadmin route is
 * gated by a permission there. On the frontend we only use these helpers to
 * decide which console nav items / pages to SHOW, so scoped staff get a clean
 * experience instead of a wall of 403s.
 *
 * Note: for routing-shell purposes the stored `user.role` is normalised to
 * 'super_admin' (so the existing RoleGuard lets any platform staff into the
 * console). The staff member's REAL role is kept in `user.platform_role`.
 */

export const PLATFORM_ROLES = [
  'super_admin', 'platform_admin', 'platform_support', 'platform_billing', 'platform_readonly',
];

export const PLATFORM_ROLE_LABELS = {
  super_admin: 'Super Admin',
  platform_admin: 'Platform Admin',
  platform_support: 'Support Agent',
  platform_billing: 'Billing Manager',
  platform_readonly: 'Read Only',
};

/** Is this user any kind of platform/console staff? */
export function isPlatformStaff(user) {
  if (!user) return false;
  return (
    user.is_super_admin === true ||
    user.role === 'super_admin' ||
    PLATFORM_ROLES.includes(user.platform_role)
  );
}

/** Does this platform user hold the given SA permission? super_admin holds all. */
export function hasSAPermission(user, key) {
  if (!user) return false;
  if (user.is_super_admin === true || user.platform_role === 'super_admin') return true;
  return Array.isArray(user.permissions) && user.permissions.includes(key);
}

/** Human label for a platform role name. */
export function platformRoleLabel(role) {
  return PLATFORM_ROLE_LABELS[role] || role || 'Staff';
}
