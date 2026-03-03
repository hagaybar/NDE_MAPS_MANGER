/**
 * User Management Component
 * Integrates user list, create, edit, and delete dialogs
 */

import i18n from '../i18n.js?v=5';
import UserList from './user-list.js';
import { showCreateUserDialog, hideCreateUserDialog } from './create-user-dialog.js';
import { showEditUserDialog, hideEditUserDialog } from './edit-user-dialog.js';
import { showDeleteUserConfirmDialog, hideDeleteUserConfirmDialog } from './delete-user-confirm-dialog.js';
import * as userService from '../user-service.js';
import { showToast } from '../app.js';

let userListInstance = null;
let currentUsers = [];
let currentPage = 1;
let searchQuery = '';

/**
 * Initialize the user management view
 */
export async function initUserManagement() {
    const container = document.getElementById('user-list-container');
    if (!container) return;

    // Initialize user list component
    userListInstance = new UserList(container);

    // Set up event listeners
    setupEventListeners();

    // Load initial users
    await loadUsers();
}

/**
 * Set up event listeners for user actions
 */
function setupEventListeners() {
    const container = document.getElementById('user-list-container');

    // Handle user edit event
    container.addEventListener('user-edit', async (event) => {
        const user = event.detail;  // detail IS the user object directly
        await handleEditUser(user);
    });

    // Handle user delete event
    container.addEventListener('user-delete', async (event) => {
        const user = event.detail;  // detail IS the user object directly
        await handleDeleteUser(user);
    });

    // Handle password reset event
    container.addEventListener('user-reset-password', async (event) => {
        const user = event.detail;  // detail IS the user object directly
        await handleResetPassword(user);
    });

    // Handle search event
    container.addEventListener('user-search', async (event) => {
        searchQuery = event.detail.query;
        currentPage = 1;
        await loadUsers();
    });

    // Handle pagination event
    container.addEventListener('user-page-change', async (event) => {
        currentPage = event.detail.page;
        await loadUsers();
    });

    // Handle add user button
    const addUserBtn = document.getElementById('add-user-btn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', handleAddUser);
    }
}

/**
 * Load users from the API
 */
async function loadUsers() {
    if (!userListInstance) return;

    userListInstance.setLoading(true);

    try {
        const result = await userService.listUsers(currentPage, searchQuery);
        currentUsers = result.users || [];

        userListInstance.updateUsers(currentUsers, {
            currentPage,
            totalPages: result.totalPages || 1,
            hasMore: !!result.nextToken
        });
    } catch (error) {
        console.error('Failed to load users:', error);
        showToast(i18n.t('users.loadError') || 'Failed to load users', 'error');
        userListInstance.updateUsers([], { currentPage: 1, totalPages: 1 });
    } finally {
        userListInstance.setLoading(false);
    }
}

/**
 * Handle add user button click
 */
async function handleAddUser() {
    try {
        const result = await showCreateUserDialog({
            userService
        });

        if (result.success) {
            showToast(i18n.t('users.createSuccess'), 'success');
            await loadUsers(); // Refresh the list
        }
    } catch (error) {
        console.error('Error in add user flow:', error);
    }
}

/**
 * Handle edit user action
 * @param {object} user - The user to edit
 */
async function handleEditUser(user) {
    try {
        const result = await showEditUserDialog({
            user,
            userService
        });

        if (result.success) {
            showToast(i18n.t('users.updateSuccess'), 'success');
            await loadUsers(); // Refresh the list
        }
    } catch (error) {
        console.error('Error in edit user flow:', error);
    }
}

/**
 * Handle delete user action
 * @param {object} user - The user to delete
 */
async function handleDeleteUser(user) {
    try {
        const result = await showDeleteUserConfirmDialog({
            user,
            userService
        });

        if (result.success) {
            showToast(i18n.t('users.deleteSuccess'), 'success');
            await loadUsers(); // Refresh the list
        }
    } catch (error) {
        console.error('Error in delete user flow:', error);
    }
}

/**
 * Handle password reset action
 * @param {object} user - The user to reset password for
 */
async function handleResetPassword(user) {
    try {
        await userService.resetPassword(user.username);
        showToast(i18n.t('users.resetSuccess'), 'success');
    } catch (error) {
        console.error('Failed to reset password:', error);
        showToast(i18n.t('users.resetError'), 'error');
    }
}
