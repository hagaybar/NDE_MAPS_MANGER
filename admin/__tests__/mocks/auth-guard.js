/**
 * Mock auth-guard module for testing.
 *
 * Treats the current user as an admin so the CSV editor's data-loading path
 * populates `csvData` (the non-admin branch early-returns with empty data,
 * which makes most editor flows untestable).
 */
export function isAdmin() {
  return true;
}

export function applyRoleBasedUI() {}

export function getCurrentUser() {
  return { role: 'admin' };
}

export function isAuthenticated() {
  return true;
}

export async function init() {
  return true;
}

export function _resetForTesting() {}
