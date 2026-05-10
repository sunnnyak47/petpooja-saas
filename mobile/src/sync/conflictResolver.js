/**
 * PetPooja Conflict Resolver
 *
 * Handles data conflicts that arise during sync between the local device
 * and the cloud backend. Implements deterministic conflict resolution rules
 * for orders and menu data.
 *
 * Resolution philosophy:
 * - Orders: local device may have stale state; cloud wins for terminal states
 * - Menu: cloud always wins (menu is master data managed from dashboard)
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const ABANDON_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

// Terminal order states where cloud has authority
const TERMINAL_STATES = ['cancelled', 'paid', 'completed', 'refunded'];

// ─── Order Conflict Resolution ────────────────────────────────────────────────

/**
 * Resolve a conflict between a local order and the cloud response.
 *
 * @param {Object} localOrder - The local order that was being synced
 *   Expected shape: { id, status, items, created_at, sync_attempts, ... }
 * @param {Object} cloudResponse - The conflict response from the server
 *   Expected shape: { id, local_id, cloud_id, status, reason, items?, message?,
 *                      invalid_item_ids? }
 *
 * @returns {Object} Resolution action:
 *   - { action: 'mark_synced', cloudId } — order already exists, treat as success
 *   - { action: 'retry_partial', items: [...] } — merge items and retry
 *   - { action: 'abandon', reason: '...' } — stop trying to sync this order
 */
export function resolveOrderConflict(localOrder, cloudResponse) {
  if (!localOrder || !cloudResponse) {
    return { action: 'abandon', reason: 'Invalid conflict data' };
  }

  const { status: cloudStatus, reason, items: cloudItems } = cloudResponse;

  // ── Case 1: Order already exists with same ID (idempotent duplicate) ────
  // The server recognized this order ID and it's already stored.
  // This is not a real conflict — just mark it as synced.
  if (reason === 'duplicate' || reason === 'already_exists') {
    return {
      action: 'mark_synced',
      cloudId: cloudResponse.cloud_id || cloudResponse.id,
    };
  }

  // ── Case 2: Cloud order is in a terminal state ──────────────────────────
  // If the order has been cancelled, paid, completed, or refunded on the cloud,
  // the cloud is the authority. Local changes are irrelevant.
  if (TERMINAL_STATES.includes(cloudStatus)) {
    return {
      action: 'mark_synced',
      cloudId: cloudResponse.cloud_id || cloudResponse.id,
      note: `Cloud order already ${cloudStatus}, accepting cloud state`,
    };
  }

  // ── Case 3: Cloud order is active — merge items ─────────────────────────
  // Both local and cloud have an active version. We merge: add any items
  // from local that aren't already present in the cloud version.
  if (cloudStatus === 'active' || cloudStatus === 'in_progress') {
    const localItems = _getOrderItems(localOrder);
    const existingCloudItems = cloudItems || [];

    // Find items in local that are not in cloud (by menu_item_id + variant)
    const cloudItemKeys = new Set(
      existingCloudItems.map((item) => _itemKey(item))
    );
    const newItems = localItems.filter(
      (item) => !cloudItemKeys.has(_itemKey(item))
    );

    if (newItems.length > 0) {
      return {
        action: 'retry_partial',
        items: newItems,
        cloudId: cloudResponse.cloud_id || cloudResponse.id,
      };
    }

    // All local items are already in cloud — nothing to add
    return {
      action: 'mark_synced',
      cloudId: cloudResponse.cloud_id || cloudResponse.id,
      note: 'All local items already present in cloud',
    };
  }

  // ── Case 4: Referenced menu_item_id not found (404 for items) ───────────
  // Some items in the order reference menu items that no longer exist.
  // Skip those items and sync the rest.
  if (reason === 'invalid_items' || reason === 'menu_item_not_found') {
    const invalidItemIds = cloudResponse.invalid_item_ids || [];
    const localItems = _getOrderItems(localOrder);

    // Filter out invalid items
    const validItems = localItems.filter(
      (item) => !invalidItemIds.includes(item.menu_item_id)
    );

    if (validItems.length === 0) {
      return {
        action: 'abandon',
        reason: 'All items in order reference non-existent menu items',
      };
    }

    return {
      action: 'retry_partial',
      items: validItems,
      skippedItemIds: invalidItemIds,
    };
  }

  // ── Case 5: Order is too old ────────────────────────────────────────────
  // If the order has been pending for more than 48 hours, abandon it.
  const orderAge = _getOrderAge(localOrder);
  if (orderAge > ABANDON_THRESHOLD_MS) {
    return {
      action: 'abandon',
      reason: 'Order pending for over 48 hours, sync abandoned',
    };
  }

  // ── Default: Unknown conflict type ──────────────────────────────────────
  // If we can't determine the conflict type, abandon to avoid infinite retries.
  return {
    action: 'abandon',
    reason: `Unknown conflict: ${reason || cloudStatus || 'no details'}`,
  };
}

// ─── Menu Conflict Resolution ─────────────────────────────────────────────────

/**
 * Resolve a conflict between a local menu item and the cloud version.
 * Menu is master data managed from the dashboard — cloud always wins.
 *
 * @param {Object} localItem - The locally cached menu item
 * @param {Object} cloudItem - The fresh menu item from the cloud
 *
 * @returns {Object} Resolution:
 *   - { action: 'overwrite', data: cloudItem } — replace local with cloud
 *   - { action: 'delete', itemId } — item removed from cloud, delete locally
 */
export function resolveMenuConflict(localItem, cloudItem) {
  // Cloud is always the source of truth for menu data.
  // The mobile app never creates or modifies menu items — it only reads them.
  // Any local differences are simply stale cache that should be replaced.
  if (!cloudItem) {
    // Item was deleted from the cloud — remove locally
    return {
      action: 'delete',
      itemId: localItem?.id || localItem?.menu_item_id,
      reason: 'Item no longer exists in cloud',
    };
  }

  return {
    action: 'overwrite',
    data: cloudItem,
    reason: 'Cloud is source of truth for menu data',
  };
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Extract items array from an order, handling various storage formats.
 */
function _getOrderItems(order) {
  if (!order) return [];

  // Already parsed array (from offlineOrders.getPendingOrders which joins items)
  if (Array.isArray(order.items)) {
    return order.items;
  }

  // Items might be a JSON string (legacy format)
  if (typeof order.items === 'string') {
    try {
      return JSON.parse(order.items);
    } catch {
      return [];
    }
  }

  // WatermelonDB model stores as items_json
  if (typeof order.itemsJson === 'string') {
    try {
      return JSON.parse(order.itemsJson);
    } catch {
      return [];
    }
  }

  return [];
}

/**
 * Generate a unique key for an order item to detect duplicates.
 * Uses menu_item_id + variant_id (if present) as the composite key.
 */
function _itemKey(item) {
  const menuId = item.menu_item_id || item.menuItemId || item.id || '';
  const variantId = item.variant_id || item.variantId || '';
  const modifiers = item.addons
    ? JSON.stringify(
        (Array.isArray(item.addons) ? item.addons : [])
          .map((a) => a.id || a.addon_id || '')
          .sort()
      )
    : '';
  return `${menuId}:${variantId}:${modifiers}`;
}

/**
 * Calculate the age of an order in milliseconds.
 */
function _getOrderAge(order) {
  if (!order) return Infinity;

  const createdAt = order.created_at || order.createdAt;
  if (!createdAt) return Infinity;

  const createdTime =
    typeof createdAt === 'number' ? createdAt : new Date(createdAt).getTime();

  if (isNaN(createdTime)) return Infinity;

  return Date.now() - createdTime;
}
