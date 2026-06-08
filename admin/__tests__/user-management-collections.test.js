/** @jest-environment jsdom */
import { jest } from '@jest/globals';

// Spy on the edit dialog to capture the options user-management passes it.
const showEditUserDialog = jest.fn().mockResolvedValue({ success: false });
jest.unstable_mockModule('../components/edit-user-dialog.js', () => ({ showEditUserDialog, hideEditUserDialog: jest.fn() }));
jest.unstable_mockModule('../components/create-user-dialog.js', () => ({ showCreateUserDialog: jest.fn(), hideCreateUserDialog: jest.fn() }));
jest.unstable_mockModule('../components/delete-user-confirm-dialog.js', () => ({ showDeleteUserConfirmDialog: jest.fn(), hideDeleteUserConfirmDialog: jest.fn() }));
jest.unstable_mockModule('../app.js', () => ({ showToast: jest.fn() }));
jest.unstable_mockModule('../user-service.js', () => ({
  listUsers: jest.fn().mockResolvedValue({ users: [{ username: 'ed1', email: 'ed1@x.com', role: 'editor', status: 'CONFIRMED' }], totalPages: 1 }),
  resetPassword: jest.fn(), createUser: jest.fn(), updateUser: jest.fn(), deleteUser: jest.fn(),
}));

// A collectionName with an internal comma must survive (quote-aware) and dedup.
const CSV = [
  'libraryName,collectionName,svgCode,floor,rangeStart,rangeEnd',
  'Sourasky,"Reference, entrance floor",CB_0,0,100,200',
  'Sourasky,Music,M_1,1,300,400',
  'Sourasky,"Reference, entrance floor",CB_1,0,200,300',
].join('\n');

global.fetch = jest.fn().mockImplementation((url) =>
  String(url).includes('/data/mapping.csv')
    ? Promise.resolve({ ok: true, text: () => Promise.resolve(CSV) })
    : Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') }));

const { initUserManagement } = await import('../components/user-management.js');

async function flush() { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); }

test('opening the edit dialog passes the CSV collection names, deduped + quote-aware (#127)', async () => {
  document.body.innerHTML = '<div id="user-list-container"></div><button id="add-user-btn"></button>';
  await initUserManagement();
  await flush();

  // handleEditUser is bound to the container's `user-edit` event.
  document.getElementById('user-list-container').dispatchEvent(new CustomEvent('user-edit', {
    detail: { username: 'ed1', email: 'ed1@x.com', role: 'editor' }, bubbles: true,
  }));
  await flush();

  expect(showEditUserDialog).toHaveBeenCalledTimes(1);
  const opts = showEditUserDialog.mock.calls[0][0];
  expect(opts.collections).toEqual(expect.arrayContaining(['Reference, entrance floor', 'Music']));
  // the quoted comma stayed one collection, and the duplicate collapsed to one entry
  expect(opts.collections.filter((c) => c === 'Reference, entrance floor')).toHaveLength(1);
});
