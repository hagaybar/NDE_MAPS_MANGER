// Cognito configuration for Primo Maps Admin
export const authConfig = {
  userPoolId: 'us-east-1_g9q5cPhVg',
  clientId: '2m6raenl0h66uvb8se2crnqibu',
  hostedUiDomain: 'https://primo-maps-auth.auth.us-east-1.amazoncognito.com',

  // Callback URLs based on environment
  get redirectUri() {
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return 'http://localhost:8080/';
    }
    return 'https://d3h8i7y9p8lyw7.cloudfront.net/admin/index.html';
  },

  // OAuth scopes
  scopes: ['openid', 'email', 'profile'],

  // Token refresh buffer (refresh 5 minutes before expiry)
  tokenRefreshBuffer: 5 * 60 * 1000, // 5 minutes in ms

  // Session storage keys
  storageKeys: {
    accessToken: 'primo_maps_access_token',
    idToken: 'primo_maps_id_token',
    refreshToken: 'primo_maps_refresh_token',
    tokenExpiry: 'primo_maps_token_expiry',
    user: 'primo_maps_user'
  }
};

export default authConfig;
