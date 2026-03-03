/**
 * User Service API Client
 * Handles user management operations through the API
 */

import authService from './auth-service.js?v=5';

/**
 * API base URL for user management endpoints
 */
export const API_BASE_URL = 'https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod';

/**
 * Default page size for pagination
 */
const DEFAULT_PAGE_SIZE = 20;

/**
 * Custom error class for API errors
 * @export
 */
export class ApiError extends Error {
  constructor(message, statusCode, originalError = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.status = statusCode;
    this.originalError = originalError;
  }
}

/**
 * Get JSON content type headers
 * @returns {Object} Headers with Content-Type
 */
function getJsonHeaders() {
  return {
    'Content-Type': 'application/json'
  };
}

/**
 * Get authorization headers using ID token from auth service
 * @returns {Object} Headers object with Authorization
 * @throws {ApiError} If not authenticated
 */
function getAuthHeaders() {
  const token = authService.getIdToken();
  if (!token) {
    throw new ApiError('Not authenticated - no ID token available', 401);
  }
  return {
    'Authorization': `Bearer ${token}`
  };
}

/**
 * Handle API response and throw appropriate errors
 * @param {Response} response - Fetch response object
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {ApiError} On non-OK response
 */
async function handleResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch (e) {
    if (!response.ok) {
      throw new ApiError(`HTTP error: ${response.status} ${response.statusText}`, response.status);
    }
    throw new ApiError('Failed to parse response JSON', response.status, e);
  }

  if (!response.ok) {
    const errorMessage = data.error || data.message || `HTTP error: ${response.status} ${response.statusText}`;
    throw new ApiError(errorMessage, response.status);
  }

  return data;
}

/**
 * List users with pagination and optional search
 * @param {number} page - Page number (1-based, for future use)
 * @param {string} search - Optional search string to filter users
 * @param {string} nextToken - Optional pagination token for next page
 * @returns {Promise<{users: Array, nextToken: string|null}>} Paginated users response
 * @throws {ApiError} On API or network error
 */
export async function listUsers(page = 1, search = '', nextToken = null) {
  const headers = getAuthHeaders();

  const params = new URLSearchParams();
  params.set('limit', DEFAULT_PAGE_SIZE.toString());

  if (search) {
    params.set('search', search);
  }

  if (nextToken) {
    params.set('nextToken', nextToken);
  }

  const url = `${API_BASE_URL}/api/users?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: headers
  });

  return handleResponse(response);
}

/**
 * Create a new user
 * @param {string} email - User's email address
 * @param {string} role - User's role ('admin' or 'editor')
 * @returns {Promise<{username: string, temporaryPassword: string}>} Created user with temporary password
 * @throws {ApiError} On API or network error
 */
export async function createUser(email, role) {
  const headers = {
    ...getAuthHeaders(),
    ...getJsonHeaders()
  };

  const url = `${API_BASE_URL}/api/users`;

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ email, role })
  });

  return handleResponse(response);
}

/**
 * Update an existing user
 * @param {string} username - Username to update
 * @param {Object} updates - Updates to apply
 * @param {string} [updates.role] - New role
 * @param {boolean} [updates.enabled] - Whether user is enabled
 * @returns {Promise<{success: boolean, message?: string}>} Update result
 * @throws {ApiError} On API or network error
 */
export async function updateUser(username, updates) {
  const headers = {
    ...getAuthHeaders(),
    ...getJsonHeaders()
  };

  const encodedUsername = encodeURIComponent(username);
  const url = `${API_BASE_URL}/api/users/${encodedUsername}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify(updates)
  });

  return handleResponse(response);
}

/**
 * Delete a user
 * @param {string} username - Username to delete
 * @returns {Promise<{success: boolean, message?: string}>} Delete result
 * @throws {ApiError} On API or network error
 */
export async function deleteUser(username) {
  const headers = getAuthHeaders();

  const encodedUsername = encodeURIComponent(username);
  const url = `${API_BASE_URL}/api/users/${encodedUsername}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: headers
  });

  return handleResponse(response);
}

/**
 * Reset a user's password
 * @param {string} username - Username to reset password for
 * @returns {Promise<{success: boolean, temporaryPassword: string}>} Reset result with new temporary password
 * @throws {ApiError} On API or network error
 */
export async function resetPassword(username) {
  const headers = getAuthHeaders();

  const encodedUsername = encodeURIComponent(username);
  const url = `${API_BASE_URL}/api/users/${encodedUsername}/reset-password`;

  const response = await fetch(url, {
    method: 'POST',
    headers: headers
  });

  return handleResponse(response);
}

// Default export as object for convenience
export default {
  API_BASE_URL,
  ApiError,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  resetPassword
};
