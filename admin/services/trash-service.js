/**
 * Trash Service for Primo Maps Location Editor
 * Manages soft-deleted locations with 30-day retention
 * @module services/trash-service
 */

// Storage key for trash data
const TRASH_STORAGE_KEY = 'primo_maps_trash';

// Retention period in days
const RETENTION_DAYS = 30;

/**
 * Get all items in trash
 * @returns {Array} Array of trashed items
 */
export function getTrashItems() {
  try {
    const stored = localStorage.getItem(TRASH_STORAGE_KEY);
    if (!stored) return [];

    const items = JSON.parse(stored);

    // Filter out expired items
    const now = Date.now();
    const validItems = items.filter(item => {
      const deletedAt = new Date(item.deletedAt).getTime();
      const expiresAt = deletedAt + (RETENTION_DAYS * 24 * 60 * 60 * 1000);
      return now < expiresAt;
    });

    // If some items were expired, update storage
    if (validItems.length !== items.length) {
      localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(validItems));
    }

    return validItems;
  } catch (error) {
    console.error('[TrashService] Error reading trash:', error);
    return [];
  }
}

/**
 * Add an item to trash
 * @param {Object} row - The row data to trash
 * @param {number} originalIndex - Original index in CSV data
 * @param {string} deletedBy - Username of who deleted it
 * @returns {Object} The trash item created
 */
export function addToTrash(row, originalIndex, deletedBy = 'unknown') {
  const items = getTrashItems();

  const trashItem = {
    id: `trash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    row: { ...row },
    originalIndex,
    deletedAt: new Date().toISOString(),
    deletedBy,
    expiresAt: new Date(Date.now() + (RETENTION_DAYS * 24 * 60 * 60 * 1000)).toISOString()
  };

  items.push(trashItem);
  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(items));

  // Dispatch event for UI updates
  document.dispatchEvent(new CustomEvent('trashUpdated', {
    detail: { action: 'add', item: trashItem, count: items.length }
  }));

  return trashItem;
}

/**
 * Restore an item from trash
 * @param {string} trashId - ID of the trash item
 * @returns {Object|null} The restored row data or null if not found
 */
export function restoreFromTrash(trashId) {
  const items = getTrashItems();
  const index = items.findIndex(item => item.id === trashId);

  if (index === -1) {
    return null;
  }

  const [restoredItem] = items.splice(index, 1);
  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(items));

  // Dispatch event for UI updates
  document.dispatchEvent(new CustomEvent('trashUpdated', {
    detail: { action: 'restore', item: restoredItem, count: items.length }
  }));

  return restoredItem.row;
}

/**
 * Permanently delete an item from trash
 * @param {string} trashId - ID of the trash item
 * @returns {boolean} True if item was deleted
 */
export function permanentlyDelete(trashId) {
  const items = getTrashItems();
  const index = items.findIndex(item => item.id === trashId);

  if (index === -1) {
    return false;
  }

  const [deletedItem] = items.splice(index, 1);
  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(items));

  // Dispatch event for UI updates
  document.dispatchEvent(new CustomEvent('trashUpdated', {
    detail: { action: 'delete', item: deletedItem, count: items.length }
  }));

  return true;
}

/**
 * Empty the entire trash
 * @returns {number} Number of items deleted
 */
export function emptyTrash() {
  const items = getTrashItems();
  const count = items.length;

  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify([]));

  // Dispatch event for UI updates
  document.dispatchEvent(new CustomEvent('trashUpdated', {
    detail: { action: 'empty', count: 0, deletedCount: count }
  }));

  return count;
}

/**
 * Restore all items from trash
 * @returns {Array} Array of restored row data
 */
export function restoreAll() {
  const items = getTrashItems();
  const rows = items.map(item => item.row);

  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify([]));

  // Dispatch event for UI updates
  document.dispatchEvent(new CustomEvent('trashUpdated', {
    detail: { action: 'restoreAll', count: 0, restoredCount: rows.length }
  }));

  return rows;
}

/**
 * Get trash item count
 * @returns {number} Number of items in trash
 */
export function getTrashCount() {
  return getTrashItems().length;
}

/**
 * Calculate days remaining before expiration
 * @param {string} deletedAt - ISO date string of deletion
 * @returns {number} Days remaining
 */
export function getDaysRemaining(deletedAt) {
  const deletedTime = new Date(deletedAt).getTime();
  const expiresAt = deletedTime + (RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const now = Date.now();
  const msRemaining = expiresAt - now;

  return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}

/**
 * Format deletion date for display
 * @param {string} deletedAt - ISO date string
 * @param {string} locale - Locale code ('en' or 'he')
 * @returns {string} Formatted date
 */
export function formatDeletedDate(deletedAt, locale = 'en') {
  const date = new Date(deletedAt);
  return date.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default {
  getTrashItems,
  addToTrash,
  restoreFromTrash,
  permanentlyDelete,
  emptyTrash,
  restoreAll,
  getTrashCount,
  getDaysRemaining,
  formatDeletedDate
};
