/**
 * Role Auth Module
 * Role-based access control for Primo Maps admin operations
 *
 * Permission Matrix:
 * - admin: read, write, delete, manage-users, restore-versions (ALL permissions)
 * - editor: read, write, restore-versions (NO delete, NO manage-users)
 */

// Valid operations in the system
const VALID_OPERATIONS = ['read', 'write', 'delete', 'manage-users', 'restore-versions'];

// Operations that require admin role
const ADMIN_ONLY_OPERATIONS = ['delete', 'manage-users'];

// Role permission matrix
const ROLE_PERMISSIONS = {
  admin: ['read', 'write', 'delete', 'manage-users', 'restore-versions'],
  editor: ['read', 'write', 'restore-versions']
};

/**
 * Check if a user has permission to perform an operation
 * @param {Object} user - User object with role property
 * @param {string} operation - Operation to check (read, write, delete, manage-users, restore-versions)
 * @param {Object} logger - Optional logger for audit logging
 * @returns {{ allowed: boolean, reason: string, statusCode?: number }}
 */
export const checkPermission = (user, operation, logger = null) => {
  // Handle missing/null user
  if (!user) {
    const result = {
      allowed: false,
      reason: 'No user provided - missing authentication',
      statusCode: 403
    };
    logAuthDecision(logger, null, operation, result);
    return result;
  }

  // Handle invalid/empty operation
  if (!operation || typeof operation !== 'string' || operation.trim() === '') {
    const result = {
      allowed: false,
      reason: 'Invalid operation - operation must be a non-empty string',
      statusCode: 403
    };
    logAuthDecision(logger, user, operation, result);
    return result;
  }

  // Handle unknown operation
  if (!VALID_OPERATIONS.includes(operation)) {
    const result = {
      allowed: false,
      reason: `Unknown operation "${operation}" - not a valid operation`,
      statusCode: 403
    };
    logAuthDecision(logger, user, operation, result);
    return result;
  }

  // Get user role
  const role = user.role;

  // Handle missing role
  if (!role) {
    const result = {
      allowed: false,
      reason: 'User has no role assigned',
      statusCode: 403
    };
    logAuthDecision(logger, user, operation, result);
    return result;
  }

  // Get permissions for the role
  const permissions = ROLE_PERMISSIONS[role];

  // Handle unknown role
  if (!permissions) {
    const result = {
      allowed: false,
      reason: `Unknown role "${role}" - insufficient permissions`,
      statusCode: 403
    };
    logAuthDecision(logger, user, operation, result);
    return result;
  }

  // Check if operation is allowed for this role
  const allowed = permissions.includes(operation);

  if (allowed) {
    const result = {
      allowed: true,
      reason: `Operation "${operation}" authorized for role "${role}"`
    };
    logAuthDecision(logger, user, operation, result);
    return result;
  }

  // Permission denied
  const result = {
    allowed: false,
    reason: `Permission denied - role "${role}" is not allowed to perform "${operation}"`,
    statusCode: 403
  };
  logAuthDecision(logger, user, operation, result);
  return result;
};

/**
 * Get all permissions for a given role
 * @param {string} role - Role name (admin, editor)
 * @returns {string[]} Array of permission names
 */
export const getPermissionsForRole = (role) => {
  if (!role || typeof role !== 'string') {
    return [];
  }

  const permissions = ROLE_PERMISSIONS[role];
  return permissions ? [...permissions] : [];
};

/**
 * Check if an operation requires admin role
 * @param {string} operation - Operation to check
 * @returns {boolean} True if operation requires admin
 */
export const requiresAdmin = (operation) => {
  if (!operation || typeof operation !== 'string') {
    return false;
  }

  return ADMIN_ONLY_OPERATIONS.includes(operation);
};

/**
 * Log authorization decision for audit purposes
 * @param {Object} logger - Logger object with info/warn methods
 * @param {Object} user - User object
 * @param {string} operation - Operation attempted
 * @param {Object} result - Authorization result
 */
const logAuthDecision = (logger, user, operation, result) => {
  if (!logger) {
    return;
  }

  const logData = {
    username: user?.username || 'unknown',
    role: user?.role || 'none',
    operation: operation || 'unknown',
    allowed: result.allowed,
    reason: result.reason,
    timestamp: new Date().toISOString()
  };

  const message = result.allowed
    ? `Authorization granted: ${user?.username || 'unknown'} -> ${operation}`
    : `Authorization denied: ${user?.username || 'unknown'} -> ${operation}`;

  if (result.allowed) {
    logger.info(message, logData);
  } else {
    logger.warn(message, logData);
  }
};

export default {
  checkPermission,
  getPermissionsForRole,
  requiresAdmin
};
