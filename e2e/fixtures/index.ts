/**
 * Fixtures Index
 * Re-exports all fixtures for easy importing
 */

export {
  test,
  expect,
  mockApiResponses,
  mockUsers,
  createAuthenticatedContext
} from './auth.fixture';

export type { UserRole, MockUser, AuthFixtures } from './auth.fixture';
