# Phase 4: Authentication & Authorization - TDD Implementation Plan

**Target**: 90% test pass rate
**Test Framework**: Jest (Lambda) + Playwright (E2E with mocked Cognito)
**Auth Strategy**: Cognito Hosted UI + OAuth 2.0 Authorization Code Flow

---

## Milestone 1: Cognito Setup & Configuration

### Task 1.1: Create Cognito User Pool and App Client
- [ ] Create User Pool with email as username
- [ ] Add custom attribute `custom:role` for RBAC (admin/editor)
- [ ] Configure password policy (min 8 chars, require numbers)
- [ ] Create App Client with OAuth 2.0 settings
- [ ] Configure Hosted UI domain: `primo-maps-auth`
- [ ] Set callback URLs:
  - `https://d3h8i7y9p8lyw7.cloudfront.net/admin/`
  - `http://localhost:8080/`
- [ ] Enable authorization code grant flow
- [ ] Save configuration to `artifacts/cognito-config.json`

**Deliverables**:
- User Pool ID
- App Client ID
- Hosted UI URL

---

## Milestone 2: Backend JWT Validation (TDD)

### Task 2.1: Setup Auth Test Infrastructure
- [ ] Install jose library for JWT handling
- [ ] Create JWT mock utilities for testing
- [ ] Setup test fixtures for valid/invalid tokens
- [ ] Create mock JWKS endpoint responses

### Task 2.2: TDD - JWT Validation Middleware
**File**: `lambda/auth-middleware.mjs`
**Test File**: `lambda/__tests__/auth-middleware.test.mjs`

**Test Cases**:
- [ ] Valid admin token - returns user with admin role
- [ ] Valid editor token - returns user with editor role
- [ ] Expired token - returns 401
- [ ] Invalid signature - returns 401
- [ ] Missing token - returns 401
- [ ] Malformed token - returns 401

**Acceptance Criteria**:
- [ ] Validates JWT signature using Cognito JWKS
- [ ] Extracts username from token claims
- [ ] Extracts role from `custom:role` claim
- [ ] Returns 401 for invalid/expired tokens
- [ ] Returns 401 for missing Authorization header
- [ ] Caches JWKS for performance
- [ ] Works with both Bearer and raw token formats

### Task 2.3: TDD - Role Authorization Helper
**File**: `lambda/role-auth.mjs`
**Test File**: `lambda/__tests__/role-auth.test.mjs`

**Permission Matrix**:
| Role   | read | write | delete | manage-users | restore-versions |
|--------|------|-------|--------|--------------|------------------|
| admin  | ✅   | ✅    | ✅     | ✅           | ✅               |
| editor | ✅   | ✅    | ❌     | ❌           | ✅               |

**Acceptance Criteria**:
- [ ] Admin role can perform all operations
- [ ] Editor role can edit but not delete
- [ ] Editor role cannot manage users
- [ ] Returns 403 for insufficient permissions
- [ ] Logs authorization decisions for audit

### Task 2.4: Update Existing Lambdas with Auth
**Lambdas to Update**:
| Lambda           | Required Role | Notes                        |
|------------------|---------------|------------------------------|
| getCsv           | editor        |                              |
| putCsv           | editor        | Extract username for version |
| listSvg          | editor        |                              |
| uploadSvg        | editor        |                              |
| deleteSvg        | admin         | Delete requires admin        |
| listVersionsCsv  | editor        |                              |
| listVersionsSvg  | editor        |                              |
| getVersion       | editor        |                              |
| restoreVersion   | editor        |                              |

**Changes**:
- [ ] Import auth-middleware.mjs
- [ ] Add validateToken() check at handler start
- [ ] Add checkPermission() for role-based operations
- [ ] Extract username from token for versioning (instead of body.username)
- [ ] Return 401 for auth failures, 403 for permission failures
- [ ] Update tests to include auth scenarios

---

## Milestone 3: Frontend Auth Integration (TDD)

### Task 3.1: TDD - Auth Service Module
**File**: `admin/auth-service.js`
**Test File**: `admin/__tests__/auth-service.test.js`

**API**:
```javascript
export default {
  login(),           // Redirect to Cognito Hosted UI
  logout(),          // Clear session, redirect to login
  isAuthenticated(), // Check if valid token exists
  getUser(),         // Returns { username, role }
  getAccessToken(),  // Returns token for API calls
}
```

**Acceptance Criteria**:
- [ ] Redirects to Cognito Hosted UI for login
- [ ] Handles OAuth callback and stores tokens
- [ ] Provides isAuthenticated() check
- [ ] Provides getUser() with username and role
- [ ] Provides getAccessToken() for API calls
- [ ] Handles token refresh automatically
- [ ] Logout clears session and redirects
- [ ] Persists auth state in sessionStorage
- [ ] Emits authStateChanged events

### Task 3.2: TDD - Login/Logout UI Components
**Files**:
- `admin/components/user-menu.js`
- `admin/__tests__/user-menu.test.js`

**i18n Additions**:
```json
{
  "auth": {
    "login": { "en": "Login", "he": "התחברות" },
    "logout": { "en": "Logout", "he": "התנתקות" },
    "admin": { "en": "Admin", "he": "מנהל" },
    "editor": { "en": "Editor", "he": "עורך" },
    "welcome": { "en": "Welcome, {name}", "he": "שלום, {name}" }
  }
}
```

**Acceptance Criteria**:
- [ ] Login button shows "Login" / "התחברות" based on locale
- [ ] User menu shows username and role
- [ ] User menu provides logout option
- [ ] Role badge shows "Admin" / "מנהל" or "Editor" / "עורך"
- [ ] Respects RTL layout in Hebrew mode

### Task 3.3: TDD - Protected Routes & Role-Based UI
**Files**:
- `admin/auth-guard.js`
- `admin/__tests__/auth-guard.test.js`

**Acceptance Criteria**:
- [ ] Auth guard redirects unauthenticated users to login
- [ ] Auth guard shows loading state during auth check
- [ ] CSV Editor visible to both admin and editor
- [ ] SVG Manager visible to both admin and editor
- [ ] Version History visible to both admin and editor
- [ ] Delete buttons only visible to admin role
- [ ] Graceful handling when user lacks permission
- [ ] Error messages are bilingual

### Task 3.4: Integration - Wire Auth into app.js
**Updates to `admin/app.js`**:
- [ ] Import auth-service
- [ ] Add auth check on app load
- [ ] Add Authorization header to all API calls
- [ ] Update version creation to use token username
- [ ] Add user menu to header
- [ ] Hide admin-only features for editors

---

## Milestone 4: E2E Testing & Deployment

### Task 4.1: Deploy Updated Lambdas
- [ ] Package Lambdas with jose dependency
- [ ] Deploy using AWS CLI
- [ ] Add Cognito authorizer to API Gateway
- [ ] Associate authorizer with admin API routes
- [ ] Verify CORS works with Authorization header

### Task 4.2: Deploy Updated Frontend
- [ ] Upload auth-related files to S3
- [ ] Invalidate CloudFront cache
- [ ] Verify login flow works end-to-end

### Task 4.3: Create Admin User
- [ ] Create admin user via AWS CLI
- [ ] Set custom:role = "admin"
- [ ] Generate temporary password
- [ ] Document first login instructions

### Task 4.4: E2E Testing with Mocked Cognito
**Scenarios**:
- [ ] Unauthenticated user redirected to login
- [ ] Admin user can access all features
- [ ] Editor user cannot see delete buttons
- [ ] Token refresh works on long sessions
- [ ] Logout clears session and redirects
- [ ] Login UI respects language setting (Hebrew/English)
- [ ] Username shown in version history after save

### Task 4.5: Run All Tests - Final Report
**Targets**:
- Backend: 90%+ pass rate
- Frontend: 90%+ pass rate
- E2E: 80%+ pass rate (some scenarios may need real Cognito)
- Overall: 90%+ pass rate

---

## Progress Tracking

### Status Legend
- ⏳ Not Started
- 🔄 In Progress
- ✅ Complete
- ❌ Blocked

### Current Progress

| Milestone | Task | Status | Notes |
|-----------|------|--------|-------|
| 1 | Cognito Setup | ⏳ | |
| 2.1 | Auth Test Setup | ⏳ | |
| 2.2 | JWT Middleware TDD | ⏳ | |
| 2.3 | Role Auth TDD | ⏳ | |
| 2.4 | Update Lambdas | ⏳ | |
| 3.1 | Auth Service TDD | ⏳ | |
| 3.2 | Login UI TDD | ⏳ | |
| 3.3 | Protected Routes TDD | ⏳ | |
| 3.4 | Integration | ⏳ | |
| 4.1 | Deploy Lambdas | ⏳ | |
| 4.2 | Deploy Frontend | ⏳ | |
| 4.3 | Create Admin User | ⏳ | |
| 4.4 | E2E Testing | ⏳ | |
| 4.5 | Final Report | ⏳ | |

---

## Files to Create

### Lambda (Backend)
- `lambda/auth-middleware.mjs` - JWT validation
- `lambda/role-auth.mjs` - Permission checking
- `lambda/__tests__/auth-middleware.test.mjs`
- `lambda/__tests__/role-auth.test.mjs`

### Admin (Frontend)
- `admin/auth-service.js` - Auth service module
- `admin/auth-config.js` - Cognito configuration
- `admin/components/user-menu.js` - User menu component
- `admin/auth-guard.js` - Route protection
- `admin/__tests__/auth-service.test.js`
- `admin/__tests__/user-menu.test.js`
- `admin/__tests__/auth-guard.test.js`

### Config/Artifacts
- `artifacts/cognito-config.json` - Cognito IDs and URLs
- `artifacts/final-test-report.json` - Test results

---

## AWS Resources

### Cognito User Pool
- **Name**: primo-maps-users
- **Region**: us-east-1
- **Custom Attributes**: custom:role (admin/editor)
- **Hosted UI Domain**: primo-maps-auth.auth.us-east-1.amazoncognito.com

### API Gateway
- **Authorizer Type**: Cognito User Pool
- **Token Source**: Authorization header

---

## Run Information

**Process File**: `.a5c/processes/phase4-auth-tdd.js`
**Inputs File**: `.a5c/processes/phase4-inputs.json`
**Run ID**: 01KJMR2JCSN3YK4DY35CVTEY02
