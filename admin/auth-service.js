/**
 * Auth Service for Primo Maps Admin
 * Handles authentication with AWS Cognito Hosted UI
 */

import { authConfig } from './auth-config.js';

// Internal state
let accessToken = null;
let idToken = null;
let refreshToken = null;
let tokenExpiry = null;
let currentUser = null;
let refreshTimer = null;
let subscribers = [];

/**
 * Parse JWT token payload (without verification - verification happens server-side)
 * @param {string} token - JWT token
 * @returns {object|null} - Decoded payload or null
 */
function parseJwt(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch (e) {
    console.error('Failed to parse JWT:', e);
    return null;
  }
}

/**
 * Extract user info from ID token
 * @param {string} idTokenStr - ID token JWT
 * @returns {object|null} - User object or null
 */
function extractUserFromIdToken(idTokenStr) {
  const payload = parseJwt(idTokenStr);
  if (!payload) return null;

  // Check custom:role attribute first, then fall back to cognito:groups
  let role = payload['custom:role'];
  if (!role) {
    const groups = payload['cognito:groups'] || [];
    role = groups.includes('admin') ? 'admin' : 'editor';
  }

  return {
    username: payload.email || payload['cognito:username'] || payload.sub,
    email: payload.email || '',
    role: role
  };
}

/**
 * Store tokens in sessionStorage
 */
function storeTokens(tokens) {
  if (tokens.access_token) {
    accessToken = tokens.access_token;
    sessionStorage.setItem(authConfig.storageKeys.accessToken, tokens.access_token);
  }
  if (tokens.id_token) {
    idToken = tokens.id_token;
    sessionStorage.setItem(authConfig.storageKeys.idToken, tokens.id_token);
    currentUser = extractUserFromIdToken(tokens.id_token);
    if (currentUser) {
      sessionStorage.setItem(authConfig.storageKeys.user, JSON.stringify(currentUser));
    }
  }
  if (tokens.refresh_token) {
    refreshToken = tokens.refresh_token;
    sessionStorage.setItem(authConfig.storageKeys.refreshToken, tokens.refresh_token);
  }
  if (tokens.expires_in) {
    tokenExpiry = Date.now() + (tokens.expires_in * 1000);
    sessionStorage.setItem(authConfig.storageKeys.tokenExpiry, tokenExpiry.toString());
  }
}

/**
 * Load tokens from sessionStorage
 * @returns {boolean} - True if valid tokens were loaded
 */
function loadTokensFromStorage() {
  const storedAccessToken = sessionStorage.getItem(authConfig.storageKeys.accessToken);
  const storedRefreshToken = sessionStorage.getItem(authConfig.storageKeys.refreshToken);
  const storedExpiry = sessionStorage.getItem(authConfig.storageKeys.tokenExpiry);
  const storedUser = sessionStorage.getItem(authConfig.storageKeys.user);

  if (!storedAccessToken || !storedExpiry) {
    return false;
  }

  const expiryTime = parseInt(storedExpiry, 10);
  if (expiryTime <= Date.now()) {
    // Tokens expired
    clearSession();
    return false;
  }

  accessToken = storedAccessToken;
  refreshToken = storedRefreshToken;
  tokenExpiry = expiryTime;
  idToken = sessionStorage.getItem(authConfig.storageKeys.idToken);

  if (storedUser) {
    try {
      currentUser = JSON.parse(storedUser);
    } catch (e) {
      currentUser = null;
    }
  }

  return true;
}

/**
 * Clear all session data
 */
function clearSession() {
  accessToken = null;
  idToken = null;
  refreshToken = null;
  tokenExpiry = null;
  currentUser = null;

  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  sessionStorage.removeItem(authConfig.storageKeys.accessToken);
  sessionStorage.removeItem(authConfig.storageKeys.idToken);
  sessionStorage.removeItem(authConfig.storageKeys.refreshToken);
  sessionStorage.removeItem(authConfig.storageKeys.tokenExpiry);
  sessionStorage.removeItem(authConfig.storageKeys.user);
}

/**
 * Notify subscribers of auth state change
 */
function notifySubscribers() {
  const state = {
    isAuthenticated: authService.isAuthenticated(),
    user: authService.getUser()
  };

  // Notify callback subscribers
  subscribers.forEach(callback => {
    try {
      callback(state);
    } catch (e) {
      console.error('Error in auth state subscriber:', e);
    }
  });

  // Dispatch custom event
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    const event = new CustomEvent('authStateChanged', { detail: state });
    window.dispatchEvent(event);
  }
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from callback
 * @returns {Promise<boolean>} - True if successful
 */
async function exchangeCodeForTokens(code) {
  const tokenEndpoint = `${authConfig.hostedUiDomain}/oauth2/token`;

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: authConfig.clientId,
    code: code,
    redirect_uri: authConfig.redirectUri
  });

  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Token exchange failed:', error);
      return false;
    }

    const tokens = await response.json();

    // Validate that we got a valid id_token
    const user = extractUserFromIdToken(tokens.id_token);
    if (!user) {
      console.error('Invalid id_token received');
      return false;
    }

    storeTokens(tokens);
    scheduleTokenRefresh();
    notifySubscribers();
    return true;
  } catch (e) {
    console.error('Token exchange error:', e);
    return false;
  }
}

/**
 * Refresh tokens using refresh_token grant
 * @returns {Promise<boolean>} - True if successful
 */
async function refreshTokens() {
  if (!refreshToken) {
    return false;
  }

  const tokenEndpoint = `${authConfig.hostedUiDomain}/oauth2/token`;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: authConfig.clientId,
    refresh_token: refreshToken
  });

  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      console.error('Token refresh failed');
      // On refresh failure, logout the user
      authService.logout();
      return false;
    }

    const tokens = await response.json();
    // Refresh response may not include refresh_token
    if (!tokens.refresh_token && refreshToken) {
      tokens.refresh_token = refreshToken;
    }
    storeTokens(tokens);
    scheduleTokenRefresh();
    notifySubscribers();
    return true;
  } catch (e) {
    console.error('Token refresh error:', e);
    authService.logout();
    return false;
  }
}

/**
 * Schedule token refresh before expiry
 */
function scheduleTokenRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  if (!tokenExpiry || !refreshToken) {
    return;
  }

  // Refresh 5 minutes before expiry (or immediately if less than 5 min left)
  const refreshTime = tokenExpiry - Date.now() - authConfig.tokenRefreshBuffer;
  const delay = Math.max(0, refreshTime);

  refreshTimer = setTimeout(() => {
    refreshTokens();
  }, delay);
}

/**
 * Build OAuth authorize URL
 * @returns {string} - Authorize URL
 */
function buildAuthorizeUrl() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: authConfig.clientId,
    redirect_uri: authConfig.redirectUri,
    scope: authConfig.scopes.join(' ')
  });

  return `${authConfig.hostedUiDomain}/oauth2/authorize?${params.toString()}`;
}

/**
 * Build logout URL
 * @returns {string} - Logout URL
 */
function buildLogoutUrl() {
  const params = new URLSearchParams({
    client_id: authConfig.clientId,
    logout_uri: authConfig.redirectUri
  });

  return `${authConfig.hostedUiDomain}/logout?${params.toString()}`;
}

/**
 * Auth Service API
 */
const authService = {
  /**
   * Initialize auth service
   * Check for OAuth callback or restore session from storage
   * @returns {Promise<boolean>} - True if authenticated
   */
  async init() {
    // Check for OAuth error in callback
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    if (error) {
      console.error('OAuth error:', error, urlParams.get('error_description'));
      // Clear URL parameters
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      return false;
    }

    // Check for OAuth authorization code callback
    const code = urlParams.get('code');
    if (code) {
      // Clear URL parameters before processing
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      const success = await exchangeCodeForTokens(code);
      return success;
    }

    // Try to restore session from storage
    if (loadTokensFromStorage()) {
      scheduleTokenRefresh();
      notifySubscribers();
      return true;
    }

    return false;
  },

  /**
   * Redirect to Cognito Hosted UI for login
   */
  login() {
    const authorizeUrl = buildAuthorizeUrl();
    window.location.assign(authorizeUrl);
  },

  /**
   * Clear session and redirect to Cognito logout
   */
  logout() {
    clearSession();
    notifySubscribers();
    const logoutUrl = buildLogoutUrl();
    window.location.assign(logoutUrl);
  },

  /**
   * Check if user is authenticated with valid tokens
   * @returns {boolean}
   */
  isAuthenticated() {
    if (!accessToken || !tokenExpiry) {
      return false;
    }
    return tokenExpiry > Date.now();
  },

  /**
   * Get current user info
   * @returns {object|null} - { username, email, role } or null
   */
  getUser() {
    if (!this.isAuthenticated()) {
      return null;
    }
    return currentUser;
  },

  /**
   * Get access token for API calls
   * @returns {string|null}
   */
  getAccessToken() {
    if (!this.isAuthenticated()) {
      return null;
    }
    return accessToken;
  },

  /**
   * Get ID token for API calls (contains custom attributes like role)
   * @returns {string|null}
   */
  getIdToken() {
    if (!this.isAuthenticated()) {
      return null;
    }
    return idToken;
  },

  /**
   * Subscribe to auth state changes
   * @param {function} callback - Called with { isAuthenticated, user }
   * @returns {function} - Unsubscribe function
   */
  onAuthStateChanged(callback) {
    subscribers.push(callback);

    // Immediately call with current state
    callback({
      isAuthenticated: this.isAuthenticated(),
      user: this.getUser()
    });

    // Return unsubscribe function
    return () => {
      subscribers = subscribers.filter(cb => cb !== callback);
    };
  }
};

export default authService;
