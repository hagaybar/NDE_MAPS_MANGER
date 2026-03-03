/**
 * @jest-environment jsdom
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// We'll import userService dynamically to allow mocking
let userService;

describe('UserService', () => {
  let originalFetch;
  let mockAuthService;

  beforeEach(async () => {
    // Reset modules to get fresh userService instance
    jest.resetModules();

    // Mock fetch
    originalFetch = global.fetch;
    global.fetch = jest.fn();

    // Mock auth-service module
    mockAuthService = {
      getIdToken: jest.fn().mockReturnValue('mock-id-token'),
      isAuthenticated: jest.fn().mockReturnValue(true)
    };

    // Setup the mock before importing
    jest.unstable_mockModule('../auth-service.js', () => ({
      default: mockAuthService
    }));

    // Import fresh userService
    const module = await import('../user-service.js');
    userService = module;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('API_BASE_URL', () => {
    test('should export API_BASE_URL constant', () => {
      expect(userService.API_BASE_URL).toBe('https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod');
    });
  });

  describe('ApiError', () => {
    test('should be an exported class', () => {
      expect(typeof userService.ApiError).toBe('function');
    });

    test('should have name, statusCode, and status properties', () => {
      const error = new userService.ApiError('Test error', 404);
      expect(error.name).toBe('ApiError');
      expect(error.statusCode).toBe(404);
      expect(error.status).toBe(404);
      expect(error.message).toBe('Test error');
    });
  });

  describe('listUsers()', () => {
    test('should be an exported function', () => {
      expect(typeof userService.listUsers).toBe('function');
    });

    test('should call GET /api/users with correct headers', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [], nextToken: null })
      });

      await userService.listUsers();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-id-token'
          })
        })
      );
    });

    test('should include search parameter when provided', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [], nextToken: null })
      });

      await userService.listUsers(1, 'john');

      const fetchUrl = global.fetch.mock.calls[0][0];
      expect(fetchUrl).toContain('search=john');
    });

    test('should include limit parameter', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [], nextToken: null })
      });

      await userService.listUsers(1, '');

      const fetchUrl = global.fetch.mock.calls[0][0];
      expect(fetchUrl).toContain('limit=');
    });

    test('should include nextToken for pagination', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [], nextToken: null })
      });

      await userService.listUsers(2, '', 'some-token');

      const fetchUrl = global.fetch.mock.calls[0][0];
      expect(fetchUrl).toContain('nextToken=some-token');
    });

    test('should return paginated users response', async () => {
      const mockResponse = {
        users: [
          { username: 'user1@example.com', email: 'user1@example.com', role: 'admin', enabled: true },
          { username: 'user2@example.com', email: 'user2@example.com', role: 'editor', enabled: true }
        ],
        nextToken: 'next-page-token'
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await userService.listUsers();

      expect(result.users).toHaveLength(2);
      expect(result.nextToken).toBe('next-page-token');
    });

    test('should throw error on API failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Server error' })
      });

      await expect(userService.listUsers()).rejects.toThrow();
    });

    test('should throw error on network failure', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(userService.listUsers()).rejects.toThrow('Network error');
    });
  });

  describe('createUser()', () => {
    test('should be an exported function', () => {
      expect(typeof userService.createUser).toBe('function');
    });

    test('should call POST /api/users with correct body', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ username: 'newuser@example.com', temporaryPassword: 'TempPass123!' })
      });

      await userService.createUser('newuser@example.com', 'editor');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer mock-id-token'
          }),
          body: JSON.stringify({ email: 'newuser@example.com', role: 'editor' })
        })
      );
    });

    test('should return created user data with temporary password', async () => {
      const mockResponse = {
        username: 'newuser@example.com',
        temporaryPassword: 'TempPass123!'
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await userService.createUser('newuser@example.com', 'editor');

      expect(result.username).toBe('newuser@example.com');
      expect(result.temporaryPassword).toBe('TempPass123!');
    });

    test('should throw error when user already exists', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        json: () => Promise.resolve({ error: 'User already exists' })
      });

      await expect(userService.createUser('existing@example.com', 'editor')).rejects.toThrow();
    });

    test('should throw error on invalid input', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Invalid email format' })
      });

      await expect(userService.createUser('invalid-email', 'editor')).rejects.toThrow();
    });
  });

  describe('updateUser()', () => {
    test('should be an exported function', () => {
      expect(typeof userService.updateUser).toBe('function');
    });

    test('should call PUT /api/users/{username} with updates', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      await userService.updateUser('user@example.com', { role: 'admin', enabled: true });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users/user%40example.com'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer mock-id-token'
          }),
          body: JSON.stringify({ role: 'admin', enabled: true })
        })
      );
    });

    test('should URL encode username in path', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      await userService.updateUser('user+special@example.com', { role: 'editor' });

      const fetchUrl = global.fetch.mock.calls[0][0];
      expect(fetchUrl).toContain(encodeURIComponent('user+special@example.com'));
    });

    test('should return success response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'User updated' })
      });

      const result = await userService.updateUser('user@example.com', { role: 'admin' });

      expect(result.success).toBe(true);
    });

    test('should throw error when user not found', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ error: 'User not found' })
      });

      await expect(userService.updateUser('nonexistent@example.com', { role: 'admin' })).rejects.toThrow();
    });

    test('should throw error on forbidden action', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ error: 'Cannot modify own role' })
      });

      await expect(userService.updateUser('self@example.com', { role: 'editor' })).rejects.toThrow();
    });
  });

  describe('deleteUser()', () => {
    test('should be an exported function', () => {
      expect(typeof userService.deleteUser).toBe('function');
    });

    test('should call DELETE /api/users/{username}', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      await userService.deleteUser('user@example.com');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users/user%40example.com'),
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-id-token'
          })
        })
      );
    });

    test('should return success response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'User deleted' })
      });

      const result = await userService.deleteUser('user@example.com');

      expect(result.success).toBe(true);
    });

    test('should throw error when user not found', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ error: 'User not found' })
      });

      await expect(userService.deleteUser('nonexistent@example.com')).rejects.toThrow();
    });

    test('should throw error when trying to delete self', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ error: 'Cannot delete yourself' })
      });

      await expect(userService.deleteUser('self@example.com')).rejects.toThrow();
    });
  });

  describe('resetPassword()', () => {
    test('should be an exported function', () => {
      expect(typeof userService.resetPassword).toBe('function');
    });

    test('should call POST /api/users/{username}/reset-password', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, temporaryPassword: 'NewTemp123!' })
      });

      await userService.resetPassword('user@example.com');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users/user%40example.com/reset-password'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-id-token'
          })
        })
      );
    });

    test('should return new temporary password', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, temporaryPassword: 'NewTemp123!' })
      });

      const result = await userService.resetPassword('user@example.com');

      expect(result.temporaryPassword).toBe('NewTemp123!');
    });

    test('should throw error when user not found', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ error: 'User not found' })
      });

      await expect(userService.resetPassword('nonexistent@example.com')).rejects.toThrow();
    });
  });

  describe('Authorization Header', () => {
    test('should get ID token from auth-service', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [] })
      });

      await userService.listUsers();

      expect(mockAuthService.getIdToken).toHaveBeenCalled();
    });

    test('should include Bearer token in Authorization header', async () => {
      mockAuthService.getIdToken.mockReturnValue('specific-token-123');

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [] })
      });

      await userService.listUsers();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer specific-token-123'
          })
        })
      );
    });

    test('should throw error when not authenticated', async () => {
      mockAuthService.getIdToken.mockReturnValue(null);

      await expect(userService.listUsers()).rejects.toThrow(/auth|token|authenticated/i);
    });
  });

  describe('Error Handling', () => {
    test('should include error message from API response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Specific error message from API' })
      });

      try {
        await userService.listUsers();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Specific error message from API');
      }
    });

    test('should include status code in error', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Server error' })
      });

      try {
        await userService.listUsers();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.statusCode || error.status || error.message).toBeDefined();
      }
    });

    test('should handle JSON parse errors gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON'))
      });

      await expect(userService.listUsers()).rejects.toThrow();
    });
  });
});
