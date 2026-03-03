/**
 * Role Auth Module Tests
 * TDD approach: RED -> GREEN -> REFACTOR
 *
 * Tests role-based access control for admin/editor permissions
 */

import {
  checkPermission,
  getPermissionsForRole,
  requiresAdmin
} from '../role-auth.mjs';

// Test user objects matching auth-middleware user structure
const testUsers = {
  admin: {
    username: 'admin-user',
    role: 'admin',
    email: 'admin@test.com',
    sub: 'admin-sub-123'
  },
  editor: {
    username: 'editor-user',
    role: 'editor',
    email: 'editor@test.com',
    sub: 'editor-sub-456'
  },
  unknownRole: {
    username: 'unknown-user',
    role: 'unknown',
    email: 'unknown@test.com',
    sub: 'unknown-sub-789'
  },
  noRole: {
    username: 'no-role-user',
    email: 'norole@test.com',
    sub: 'norole-sub-000'
  }
};

// Audit log collector for testing
let auditLogs = [];
const mockLogger = {
  info: (message, data) => {
    auditLogs.push({ level: 'info', message, data });
  },
  warn: (message, data) => {
    auditLogs.push({ level: 'warn', message, data });
  },
  error: (message, data) => {
    auditLogs.push({ level: 'error', message, data });
  }
};

describe('Role Auth Module', () => {
  beforeEach(() => {
    // Clear audit logs before each test
    auditLogs = [];
  });

  describe('checkPermission', () => {
    describe('Admin role permissions', () => {
      it('should allow admin to read', () => {
        const result = checkPermission(testUsers.admin, 'read', mockLogger);

        expect(result.allowed).toBe(true);
        expect(result.reason).toMatch(/allowed|permitted|authorized/i);
      });

      it('should allow admin to write', () => {
        const result = checkPermission(testUsers.admin, 'write', mockLogger);

        expect(result.allowed).toBe(true);
      });

      it('should allow admin to delete', () => {
        const result = checkPermission(testUsers.admin, 'delete', mockLogger);

        expect(result.allowed).toBe(true);
      });

      it('should allow admin to manage-users', () => {
        const result = checkPermission(testUsers.admin, 'manage-users', mockLogger);

        expect(result.allowed).toBe(true);
      });

      it('should allow admin to restore-versions', () => {
        const result = checkPermission(testUsers.admin, 'restore-versions', mockLogger);

        expect(result.allowed).toBe(true);
      });

      it('should allow admin all operations', () => {
        const operations = ['read', 'write', 'delete', 'manage-users', 'restore-versions'];

        for (const operation of operations) {
          const result = checkPermission(testUsers.admin, operation, mockLogger);
          expect(result.allowed).toBe(true);
        }
      });
    });

    describe('Editor role permissions', () => {
      it('should allow editor to read', () => {
        const result = checkPermission(testUsers.editor, 'read', mockLogger);

        expect(result.allowed).toBe(true);
      });

      it('should allow editor to write', () => {
        const result = checkPermission(testUsers.editor, 'write', mockLogger);

        expect(result.allowed).toBe(true);
      });

      it('should allow editor to restore-versions', () => {
        const result = checkPermission(testUsers.editor, 'restore-versions', mockLogger);

        expect(result.allowed).toBe(true);
      });

      it('should NOT allow editor to delete', () => {
        const result = checkPermission(testUsers.editor, 'delete', mockLogger);

        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/denied|forbidden|insufficient|not allowed/i);
      });

      it('should NOT allow editor to manage-users', () => {
        const result = checkPermission(testUsers.editor, 'manage-users', mockLogger);

        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/denied|forbidden|insufficient|not allowed/i);
      });
    });

    describe('Unknown role permissions', () => {
      it('should NOT allow unknown role to read', () => {
        const result = checkPermission(testUsers.unknownRole, 'read', mockLogger);

        expect(result.allowed).toBe(false);
      });

      it('should NOT allow unknown role to write', () => {
        const result = checkPermission(testUsers.unknownRole, 'write', mockLogger);

        expect(result.allowed).toBe(false);
      });

      it('should NOT allow unknown role any operations', () => {
        const operations = ['read', 'write', 'delete', 'manage-users', 'restore-versions'];

        for (const operation of operations) {
          const result = checkPermission(testUsers.unknownRole, operation, mockLogger);
          expect(result.allowed).toBe(false);
        }
      });
    });

    describe('Missing/null user handling', () => {
      it('should NOT allow null user', () => {
        const result = checkPermission(null, 'read', mockLogger);

        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/missing|invalid|no user/i);
      });

      it('should NOT allow undefined user', () => {
        const result = checkPermission(undefined, 'read', mockLogger);

        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/missing|invalid|no user/i);
      });

      it('should NOT allow user without role', () => {
        const result = checkPermission(testUsers.noRole, 'read', mockLogger);

        expect(result.allowed).toBe(false);
      });
    });

    describe('Invalid operation handling', () => {
      it('should NOT allow unknown operation', () => {
        const result = checkPermission(testUsers.admin, 'unknown-operation', mockLogger);

        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/invalid|unknown|operation/i);
      });

      it('should NOT allow empty operation', () => {
        const result = checkPermission(testUsers.admin, '', mockLogger);

        expect(result.allowed).toBe(false);
      });

      it('should NOT allow null operation', () => {
        const result = checkPermission(testUsers.admin, null, mockLogger);

        expect(result.allowed).toBe(false);
      });
    });

    describe('Audit logging', () => {
      it('should log successful authorization', () => {
        checkPermission(testUsers.admin, 'read', mockLogger);

        expect(auditLogs.length).toBeGreaterThan(0);
        const log = auditLogs.find(l => l.level === 'info');
        expect(log).toBeDefined();
        expect(log.data).toBeDefined();
        expect(log.data.operation).toBe('read');
        expect(log.data.allowed).toBe(true);
      });

      it('should log denied authorization', () => {
        checkPermission(testUsers.editor, 'delete', mockLogger);

        expect(auditLogs.length).toBeGreaterThan(0);
        const log = auditLogs.find(l => l.level === 'warn');
        expect(log).toBeDefined();
        expect(log.data).toBeDefined();
        expect(log.data.operation).toBe('delete');
        expect(log.data.allowed).toBe(false);
      });

      it('should include user info in audit log', () => {
        checkPermission(testUsers.admin, 'write', mockLogger);

        const log = auditLogs[0];
        expect(log.data.username).toBe(testUsers.admin.username);
        expect(log.data.role).toBe(testUsers.admin.role);
      });

      it('should work without logger (no error)', () => {
        // Should not throw when logger is not provided
        expect(() => {
          checkPermission(testUsers.admin, 'read');
        }).not.toThrow();
      });
    });
  });

  describe('getPermissionsForRole', () => {
    it('should return all permissions for admin role', () => {
      const permissions = getPermissionsForRole('admin');

      expect(permissions).toContain('read');
      expect(permissions).toContain('write');
      expect(permissions).toContain('delete');
      expect(permissions).toContain('manage-users');
      expect(permissions).toContain('restore-versions');
      expect(permissions.length).toBe(5);
    });

    it('should return limited permissions for editor role', () => {
      const permissions = getPermissionsForRole('editor');

      expect(permissions).toContain('read');
      expect(permissions).toContain('write');
      expect(permissions).toContain('restore-versions');
      expect(permissions).not.toContain('delete');
      expect(permissions).not.toContain('manage-users');
      expect(permissions.length).toBe(3);
    });

    it('should return empty array for unknown role', () => {
      const permissions = getPermissionsForRole('unknown');

      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBe(0);
    });

    it('should return empty array for null role', () => {
      const permissions = getPermissionsForRole(null);

      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBe(0);
    });

    it('should return empty array for undefined role', () => {
      const permissions = getPermissionsForRole(undefined);

      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBe(0);
    });

    it('should return empty array for empty string role', () => {
      const permissions = getPermissionsForRole('');

      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBe(0);
    });
  });

  describe('requiresAdmin', () => {
    it('should return true for delete operation', () => {
      expect(requiresAdmin('delete')).toBe(true);
    });

    it('should return true for manage-users operation', () => {
      expect(requiresAdmin('manage-users')).toBe(true);
    });

    it('should return false for read operation', () => {
      expect(requiresAdmin('read')).toBe(false);
    });

    it('should return false for write operation', () => {
      expect(requiresAdmin('write')).toBe(false);
    });

    it('should return false for restore-versions operation', () => {
      expect(requiresAdmin('restore-versions')).toBe(false);
    });

    it('should return false for unknown operation', () => {
      // Unknown operations aren't admin-only, they're just invalid
      expect(requiresAdmin('unknown')).toBe(false);
    });

    it('should return false for null operation', () => {
      expect(requiresAdmin(null)).toBe(false);
    });

    it('should return false for empty operation', () => {
      expect(requiresAdmin('')).toBe(false);
    });
  });

  describe('Permission matrix integration', () => {
    it('should match admin permissions with getPermissionsForRole', () => {
      const permissions = getPermissionsForRole('admin');

      for (const perm of permissions) {
        const result = checkPermission(testUsers.admin, perm, mockLogger);
        expect(result.allowed).toBe(true);
      }
    });

    it('should match editor permissions with getPermissionsForRole', () => {
      const permissions = getPermissionsForRole('editor');

      for (const perm of permissions) {
        const result = checkPermission(testUsers.editor, perm, mockLogger);
        expect(result.allowed).toBe(true);
      }
    });

    it('should deny editor for admin-only operations', () => {
      const adminOnlyOps = ['delete', 'manage-users'];

      for (const op of adminOnlyOps) {
        expect(requiresAdmin(op)).toBe(true);
        const result = checkPermission(testUsers.editor, op, mockLogger);
        expect(result.allowed).toBe(false);
      }
    });
  });

  describe('403 response generation', () => {
    it('should return statusCode 403 for insufficient permissions', () => {
      const result = checkPermission(testUsers.editor, 'delete', mockLogger);

      // The result should be compatible with generating a 403 response
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(403);
    });

    it('should return statusCode 403 for unknown role', () => {
      const result = checkPermission(testUsers.unknownRole, 'read', mockLogger);

      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(403);
    });

    it('should return statusCode 403 for missing user', () => {
      const result = checkPermission(null, 'read', mockLogger);

      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(403);
    });
  });
});
