// SVG File Manager Component - Upload and Delete SVG Files
import i18n from '../i18n.js?v=3';
import { showToast } from './toast.js?v=3';

// Constants
const API_ENDPOINT = 'https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod';
const CLOUDFRONT_URL = 'https://d3h8i7y9p8lyw7.cloudfront.net';

// Module variables
let svgFiles = [];

/**
 * Initialize the SVG Manager component
 */
export function initSVGManager() {
  const container = document.getElementById('svg-manager');
  if (!container) {
    console.error('SVG Manager container not found');
    return;
  }

  container.innerHTML = renderManager();
  setupManagerEvents();
  loadFiles();

  // Listen for locale changes to re-render
  document.addEventListener('localeChanged', () => {
    container.innerHTML = renderManager();
    setupManagerEvents();
    renderGrid();
  });
}

/**
 * Render the manager container HTML
 */
function renderManager() {
  return `
    <div class="card bg-white rounded-lg shadow p-6">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 class="text-xl font-semibold text-gray-800">${escapeHtml(i18n.t('svg.title'))}</h2>
        <button
          id="btn-upload-toggle"
          class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
          </svg>
          ${escapeHtml(i18n.t('svg.upload'))}
        </button>
      </div>

      <!-- Upload Dropzone (hidden by default) -->
      <div id="upload-dropzone" class="hidden mb-6 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
        </svg>
        <p class="text-gray-600 mb-2">${escapeHtml(i18n.t('svg.dropzoneText') || 'Drop SVG files here or click to select')}</p>
        <p class="text-sm text-gray-400">${escapeHtml(i18n.t('svg.dropzoneHint') || 'Only .svg files are accepted')}</p>
        <input
          type="file"
          id="svg-file-input"
          accept=".svg"
          class="hidden"
        >
      </div>

      <!-- File Grid -->
      <div id="svg-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="flex items-center justify-center py-12 text-gray-500 col-span-full">
          ${escapeHtml(i18n.t('common.loading'))}
        </div>
      </div>

      <!-- Preview Modal -->
      <div id="svg-preview-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-lg shadow-xl max-w-4xl max-h-[90vh] w-full overflow-hidden">
          <div class="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 id="preview-title" class="text-lg font-semibold text-gray-800"></h3>
            <button id="btn-close-preview" class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div id="preview-content" class="p-8 flex items-center justify-center overflow-auto" style="max-height: calc(90vh - 80px);">
            <!-- Preview image will be inserted here -->
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Load SVG files from the API
 */
async function loadFiles() {
  const gridContainer = document.getElementById('svg-grid');

  try {
    const response = await fetch(`${API_ENDPOINT}/api/svg`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    svgFiles = data.files || [];
    renderGrid();
  } catch (error) {
    console.error('Failed to load SVG files:', error);
    gridContainer.innerHTML = `
      <div class="flex items-center justify-center py-12 text-red-500 col-span-full">
        ${escapeHtml(i18n.t('common.error'))}: ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/**
 * Render the file grid
 */
function renderGrid() {
  const gridContainer = document.getElementById('svg-grid');

  if (!gridContainer) return;

  if (svgFiles.length === 0) {
    gridContainer.innerHTML = `
      <div class="flex items-center justify-center py-12 text-gray-500 col-span-full">
        ${escapeHtml(i18n.t('svg.noFiles') || 'No SVG files found')}
      </div>
    `;
    return;
  }

  gridContainer.innerHTML = svgFiles.map(file => {
    const filename = file.name;
    const thumbnailUrl = `${CLOUDFRONT_URL}/maps/${file.name}`;
    const formattedSize = formatSize(file.size);

    return `
      <div class="svg-card bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow" data-name="${escapeHtml(file.name)}">
        <div class="aspect-square bg-gray-50 p-4 flex items-center justify-center border-b border-gray-200">
          <img
            src="${escapeHtml(thumbnailUrl)}"
            alt="${escapeHtml(filename)}"
            class="max-w-full max-h-full object-contain"
            onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><text x=%2212%22 y=%2212%22 text-anchor=%22middle%22>?</text></svg>';"
          >
        </div>
        <div class="p-3">
          <p class="text-sm font-medium text-gray-800 truncate mb-1" title="${escapeHtml(filename)}">
            ${escapeHtml(filename)}
          </p>
          <p class="text-xs text-gray-500 mb-3">
            ${escapeHtml(formattedSize)}
          </p>
          <div class="flex gap-2">
            <button
              class="btn-preview flex-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              data-name="${escapeHtml(file.name)}"
            >
              ${escapeHtml(i18n.t('svg.preview'))}
            </button>
            <button
              class="btn-delete flex-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              data-filename="${escapeHtml(filename)}"
            >
              ${escapeHtml(i18n.t('svg.delete'))}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Set up event listeners for the manager
 */
function setupManagerEvents() {
  const uploadToggleBtn = document.getElementById('btn-upload-toggle');
  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('svg-file-input');
  const gridContainer = document.getElementById('svg-grid');
  const previewModal = document.getElementById('svg-preview-modal');
  const closePreviewBtn = document.getElementById('btn-close-preview');

  // Toggle dropzone visibility
  uploadToggleBtn?.addEventListener('click', () => {
    dropzone.classList.toggle('hidden');
  });

  // Dropzone click to trigger file input
  dropzone?.addEventListener('click', (e) => {
    if (e.target !== fileInput) {
      fileInput.click();
    }
  });

  // File input change
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadFile(file);
      fileInput.value = ''; // Reset input
    }
  });

  // Drag and drop events
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('border-blue-500', 'bg-blue-50');
  });

  dropzone?.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('border-blue-500', 'bg-blue-50');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('border-blue-500', 'bg-blue-50');

    const file = e.dataTransfer.files[0];
    if (file) {
      uploadFile(file);
    }
  });

  // Preview button clicks (delegated)
  gridContainer?.addEventListener('click', (e) => {
    const previewBtn = e.target.closest('.btn-preview');
    if (previewBtn) {
      const name = previewBtn.dataset.name;
      showPreview(name);
    }

    const deleteBtn = e.target.closest('.btn-delete');
    if (deleteBtn) {
      const filename = deleteBtn.dataset.filename;
      deleteFile(filename);
    }
  });

  // Close preview button
  closePreviewBtn?.addEventListener('click', () => {
    previewModal.classList.add('hidden');
  });

  // Close preview on backdrop click
  previewModal?.addEventListener('click', (e) => {
    if (e.target === previewModal) {
      previewModal.classList.add('hidden');
    }
  });

  // Close preview on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !previewModal.classList.contains('hidden')) {
      previewModal.classList.add('hidden');
    }
  });
}

/**
 * Upload an SVG file
 */
async function uploadFile(file) {
  // Validate file type
  if (!file.name.toLowerCase().endsWith('.svg')) {
    showToast(i18n.t('svg.invalidFile') || 'Only SVG files are allowed', 'error');
    return;
  }

  try {
    // Read file content
    const content = await file.text();

    // Upload to API
    const response = await fetch(`${API_ENDPOINT}/api/svg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: file.name,
        content: content,
        username: 'admin'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      showToast(i18n.t('svg.uploadSuccess') || 'File uploaded successfully', 'success');
      // Hide dropzone after successful upload
      document.getElementById('upload-dropzone')?.classList.add('hidden');
      // Reload file list
      await loadFiles();
    } else {
      throw new Error(result.message || 'Upload failed');
    }
  } catch (error) {
    console.error('Failed to upload SVG:', error);
    showToast(i18n.t('svg.uploadError') || 'Failed to upload file', 'error');
  }
}

/**
 * Delete an SVG file
 */
async function deleteFile(filename) {
  // Confirm with user
  const confirmMessage = i18n.t('svg.confirmDelete') || `Are you sure you want to delete "${filename}"?`;
  if (!confirm(confirmMessage.replace('{filename}', filename))) {
    return;
  }

  try {
    const response = await fetch(`${API_ENDPOINT}/api/svg`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: filename,
        username: 'admin'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      showToast(i18n.t('svg.deleteSuccess') || 'File deleted successfully', 'success');
      // Reload file list
      await loadFiles();
    } else {
      throw new Error(result.message || 'Delete failed');
    }
  } catch (error) {
    console.error('Failed to delete SVG:', error);
    showToast(i18n.t('svg.deleteError') || 'Failed to delete file', 'error');
  }
}

/**
 * Show preview of an SVG file
 */
function showPreview(name) {
  const previewModal = document.getElementById('svg-preview-modal');
  const previewTitle = document.getElementById('preview-title');
  const previewContent = document.getElementById('preview-content');

  if (!previewModal || !previewTitle || !previewContent) return;

  const filename = name;
  const imageUrl = `${CLOUDFRONT_URL}/maps/${name}`;

  previewTitle.textContent = filename;
  previewContent.innerHTML = `
    <img
      src="${escapeHtml(imageUrl)}"
      alt="${escapeHtml(filename)}"
      class="max-w-full max-h-full object-contain"
      style="max-height: calc(90vh - 120px);"
    >
  `;

  previewModal.classList.remove('hidden');
}

/**
 * Format file size in human-readable format
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
