# Phase 2: Admin UI - File Management (Bilingual) - Detailed Tasks

## Summary

| Item | Value |
|------|-------|
| Goal | Build bilingual web interface for managing CSV and SVG files |
| Languages | Hebrew (RTL) and English (LTR) |
| Stack | Vanilla JS + Tailwind CSS (CDN), Lambda + API Gateway |
| CloudFront URL | `https://d3h8i7y9p8lyw7.cloudfront.net` |
| S3 Bucket | `tau-cenlib-primo-assets-hagay-3602` |

---

## Task Overview

| Task | Name | Estimated Effort |
|------|------|------------------|
| 1 | Project Setup & i18n Framework | 2-3 hours |
| 2 | Admin SPA Shell (Bilingual) | 3-4 hours |
| 3 | Lambda Functions - CSV API | 2-3 hours |
| 4 | Lambda Functions - SVG API | 2-3 hours |
| 5 | API Gateway Setup | 1-2 hours |
| 6 | CSV Editor Component | 4-6 hours |
| 7 | SVG File Manager Component | 3-4 hours |
| 8 | Input Validation (Localized) | 2-3 hours |
| 9 | Deploy & Test Admin UI | 2-3 hours |

---

## Task 1: Project Setup & i18n Framework

**Goal**: Set up the admin project structure and internationalization system

### 1.1 Create admin folder structure
```bash
mkdir -p admin/i18n admin/components admin/styles
```

### 1.2 Create translation files

**admin/i18n/en.json**:
```json
{
  "app": {
    "title": "Shelf Maps Admin",
    "logout": "Logout",
    "language": "Language"
  },
  "nav": {
    "csvEditor": "CSV Editor",
    "svgManager": "Map Files",
    "settings": "Settings"
  },
  "csv": {
    "title": "Location Mapping Editor",
    "save": "Save Changes",
    "cancel": "Cancel",
    "addRow": "Add Row",
    "deleteRow": "Delete Row",
    "search": "Search...",
    "unsavedChanges": "You have unsaved changes",
    "saveSuccess": "Changes saved successfully",
    "saveError": "Failed to save changes"
  },
  "svg": {
    "title": "Map Files",
    "upload": "Upload New Map",
    "delete": "Delete",
    "replace": "Replace",
    "preview": "Preview",
    "confirmDelete": "Are you sure you want to delete this file?"
  },
  "validation": {
    "required": "This field is required",
    "invalidFormat": "Invalid format",
    "invalidRange": "Invalid range values"
  },
  "common": {
    "loading": "Loading...",
    "error": "An error occurred",
    "confirm": "Confirm",
    "cancel": "Cancel",
    "yes": "Yes",
    "no": "No"
  }
}
```

**admin/i18n/he.json**:
```json
{
  "app": {
    "title": "ניהול מפות מדפים",
    "logout": "התנתק",
    "language": "שפה"
  },
  "nav": {
    "csvEditor": "עורך CSV",
    "svgManager": "קבצי מפות",
    "settings": "הגדרות"
  },
  "csv": {
    "title": "עורך מיפוי מיקומים",
    "save": "שמור שינויים",
    "cancel": "ביטול",
    "addRow": "הוסף שורה",
    "deleteRow": "מחק שורה",
    "search": "חיפוש...",
    "unsavedChanges": "יש שינויים שלא נשמרו",
    "saveSuccess": "השינויים נשמרו בהצלחה",
    "saveError": "שגיאה בשמירת השינויים"
  },
  "svg": {
    "title": "קבצי מפות",
    "upload": "העלה מפה חדשה",
    "delete": "מחק",
    "replace": "החלף",
    "preview": "תצוגה מקדימה",
    "confirmDelete": "האם אתה בטוח שברצונך למחוק קובץ זה?"
  },
  "validation": {
    "required": "שדה חובה",
    "invalidFormat": "פורמט לא תקין",
    "invalidRange": "ערכי טווח לא תקינים"
  },
  "common": {
    "loading": "טוען...",
    "error": "אירעה שגיאה",
    "confirm": "אישור",
    "cancel": "ביטול",
    "yes": "כן",
    "no": "לא"
  }
}
```

### 1.3 Create i18n utility module

**admin/i18n.js**:
```javascript
// Simple i18n system
const i18n = {
  locale: 'he', // Default to Hebrew
  translations: {},

  async init() {
    const saved = localStorage.getItem('locale');
    this.locale = saved || 'he';
    await this.loadTranslations();
    this.applyDirection();
  },

  async loadTranslations() {
    const [he, en] = await Promise.all([
      fetch('i18n/he.json').then(r => r.json()),
      fetch('i18n/en.json').then(r => r.json())
    ]);
    this.translations = { he, en };
  },

  t(key) {
    const keys = key.split('.');
    let value = this.translations[this.locale];
    for (const k of keys) {
      value = value?.[k];
    }
    return value || key;
  },

  setLocale(locale) {
    this.locale = locale;
    localStorage.setItem('locale', locale);
    this.applyDirection();
    document.dispatchEvent(new CustomEvent('localeChanged'));
  },

  applyDirection() {
    document.documentElement.dir = this.locale === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = this.locale;
  },

  isRTL() {
    return this.locale === 'he';
  }
};

export default i18n;
```

### Success Criteria
- [ ] Translation files created for Hebrew and English
- [ ] i18n utility can load and switch languages
- [ ] Language persists in localStorage
- [ ] RTL/LTR direction changes with language

---

## Task 2: Admin SPA Shell (Bilingual)

**Goal**: Create the main admin interface layout with bilingual support

### 2.1 Create admin/index.html
```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shelf Maps Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="styles/app.css">
</head>
<body class="bg-gray-100 min-h-screen">
  <!-- Header -->
  <header class="bg-white shadow-sm">
    <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
      <h1 id="app-title" class="text-xl font-bold text-gray-800"></h1>
      <div class="flex items-center gap-4">
        <!-- Language Toggle -->
        <div class="flex items-center gap-2">
          <button id="lang-en" class="px-3 py-1 rounded text-sm">EN</button>
          <button id="lang-he" class="px-3 py-1 rounded text-sm">עב</button>
        </div>
      </div>
    </div>
  </header>

  <!-- Navigation -->
  <nav class="bg-white border-b">
    <div class="max-w-7xl mx-auto px-4">
      <div class="flex gap-4">
        <button id="nav-csv" class="nav-tab px-4 py-3 border-b-2 border-transparent hover:border-blue-500"></button>
        <button id="nav-svg" class="nav-tab px-4 py-3 border-b-2 border-transparent hover:border-blue-500"></button>
      </div>
    </div>
  </nav>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-4 py-6">
    <div id="csv-editor" class="view"></div>
    <div id="svg-manager" class="view hidden"></div>
  </main>

  <!-- Toast Notifications -->
  <div id="toast-container" class="fixed bottom-4 end-4 z-50"></div>

  <script type="module" src="app.js"></script>
</body>
</html>
```

### 2.2 Create admin/styles/app.css
```css
/* RTL-compatible styles using logical properties */

/* Navigation active state */
.nav-tab.active {
  border-color: #3b82f6;
  color: #3b82f6;
  font-weight: 500;
}

/* Language toggle */
.lang-btn.active {
  background-color: #3b82f6;
  color: white;
}

/* BiDi text handling */
[dir="auto"] {
  unicode-bidi: isolate;
}

/* Table styles for CSV editor */
.csv-table {
  width: 100%;
  border-collapse: collapse;
}

.csv-table th,
.csv-table td {
  padding: 0.5rem;
  border: 1px solid #e5e7eb;
  text-align: start;
}

.csv-table th {
  background-color: #f9fafb;
  font-weight: 600;
}

/* Use logical properties */
.card {
  padding-inline: 1rem;
  margin-block: 1rem;
}

/* RTL-aware icons */
[dir="rtl"] .icon-arrow {
  transform: scaleX(-1);
}
```

### 2.3 Create admin/app.js (main entry point)
```javascript
import i18n from './i18n.js';
import { initCSVEditor } from './components/csv-editor.js';
import { initSVGManager } from './components/svg-manager.js';

async function init() {
  await i18n.init();
  updateUI();
  setupEventListeners();
  showView('csv');
}

function updateUI() {
  // Update all translatable elements
  document.getElementById('app-title').textContent = i18n.t('app.title');
  document.getElementById('nav-csv').textContent = i18n.t('nav.csvEditor');
  document.getElementById('nav-svg').textContent = i18n.t('nav.svgManager');

  // Update language toggle buttons
  document.getElementById('lang-en').classList.toggle('active', i18n.locale === 'en');
  document.getElementById('lang-he').classList.toggle('active', i18n.locale === 'he');
}

function setupEventListeners() {
  // Language toggle
  document.getElementById('lang-en').addEventListener('click', () => {
    i18n.setLocale('en');
    updateUI();
  });
  document.getElementById('lang-he').addEventListener('click', () => {
    i18n.setLocale('he');
    updateUI();
  });

  // Navigation
  document.getElementById('nav-csv').addEventListener('click', () => showView('csv'));
  document.getElementById('nav-svg').addEventListener('click', () => showView('svg'));

  // Listen for locale changes
  document.addEventListener('localeChanged', updateUI);
}

function showView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  if (view === 'csv') {
    document.getElementById('csv-editor').classList.remove('hidden');
    document.getElementById('nav-csv').classList.add('active');
    initCSVEditor();
  } else {
    document.getElementById('svg-manager').classList.remove('hidden');
    document.getElementById('nav-svg').classList.add('active');
    initSVGManager();
  }
}

init();
```

### Success Criteria
- [ ] Admin shell renders correctly
- [ ] Language toggle switches between Hebrew/English
- [ ] RTL layout applies correctly for Hebrew
- [ ] Navigation between views works

---

## Task 3: Lambda Functions - CSV API

**Goal**: Create Lambda functions for CSV read/write operations

### 3.1 Create Lambda function: getCsv
```javascript
// lambda/getCsv.js
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';

export const handler = async (event) => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: 'data/mapping.csv'
    });

    const response = await s3.send(command);
    const csvContent = await response.Body.transformToString();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      },
      body: csvContent
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

### 3.2 Create Lambda function: putCsv
```javascript
// lambda/putCsv.js
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';

const s3 = new S3Client({ region: 'us-east-1' });
const cf = new CloudFrontClient({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';
const CF_DIST_ID = 'E5SR0E5GM5GSB';
const MAX_VERSIONS = 20;

export const handler = async (event) => {
  try {
    const { csvContent, username } = JSON.parse(event.body);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // 1. Get current file and save as version
    try {
      const current = await s3.send(new GetObjectCommand({
        Bucket: BUCKET,
        Key: 'data/mapping.csv'
      }));
      const currentContent = await current.Body.transformToString();

      // Save to versions
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: `versions/data/mapping_${timestamp}_${username || 'unknown'}.csv`,
        Body: currentContent,
        ContentType: 'text/csv; charset=utf-8'
      }));
    } catch (e) {
      // No existing file, skip versioning
    }

    // 2. Write new content
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: 'data/mapping.csv',
      Body: csvContent,
      ContentType: 'text/csv; charset=utf-8'
    }));

    // 3. Cleanup old versions (keep last N)
    const versions = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: 'versions/data/mapping_'
    }));

    if (versions.Contents && versions.Contents.length > MAX_VERSIONS) {
      const sorted = versions.Contents.sort((a, b) =>
        new Date(b.LastModified) - new Date(a.LastModified)
      );
      const toDelete = sorted.slice(MAX_VERSIONS);

      for (const obj of toDelete) {
        await s3.send(new DeleteObjectCommand({
          Bucket: BUCKET,
          Key: obj.Key
        }));
      }
    }

    // 4. Invalidate CloudFront cache
    await cf.send(new CreateInvalidationCommand({
      DistributionId: CF_DIST_ID,
      InvalidationBatch: {
        CallerReference: `csv-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: ['/data/mapping.csv']
        }
      }
    }));

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        versionCreated: `mapping_${timestamp}_${username || 'unknown'}.csv`
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

### 3.3 Deploy Lambda functions
```bash
# Package and deploy getCsv
cd lambda
zip getCsv.zip getCsv.js
aws lambda create-function \
  --function-name primo-maps-getCsv \
  --runtime nodejs18.x \
  --handler getCsv.handler \
  --role arn:aws:iam::ACCOUNT:role/lambda-s3-role \
  --zip-file fileb://getCsv.zip

# Package and deploy putCsv
zip putCsv.zip putCsv.js
aws lambda create-function \
  --function-name primo-maps-putCsv \
  --runtime nodejs18.x \
  --handler putCsv.handler \
  --role arn:aws:iam::ACCOUNT:role/lambda-s3-cf-role \
  --zip-file fileb://putCsv.zip
```

### Success Criteria
- [ ] Lambda getCsv returns CSV content
- [ ] Lambda putCsv saves CSV and creates version
- [ ] Old versions are automatically pruned
- [ ] CloudFront cache is invalidated on save

---

## Task 4: Lambda Functions - SVG API

**Goal**: Create Lambda functions for SVG file management

### 4.1 Create Lambda function: listSvg
```javascript
// lambda/listSvg.js
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';

export const handler = async (event) => {
  try {
    const response = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: 'maps/'
    }));

    const files = await Promise.all(
      (response.Contents || [])
        .filter(obj => obj.Key.endsWith('.svg'))
        .map(async (obj) => {
          const head = await s3.send(new HeadObjectCommand({
            Bucket: BUCKET,
            Key: obj.Key
          }));
          return {
            key: obj.Key,
            name: obj.Key.replace('maps/', ''),
            size: obj.Size,
            lastModified: obj.LastModified,
            contentType: head.ContentType
          };
        })
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ files })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

### 4.2 Create Lambda function: uploadSvg
```javascript
// lambda/uploadSvg.js
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';

const s3 = new S3Client({ region: 'us-east-1' });
const cf = new CloudFrontClient({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';
const CF_DIST_ID = 'E5SR0E5GM5GSB';

export const handler = async (event) => {
  try {
    const { filename, content, username } = JSON.parse(event.body);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Validate SVG
    if (!content.includes('<svg')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid SVG file' })
      };
    }

    // Check if replacing existing file - create version
    try {
      const existing = await s3.send(new GetObjectCommand({
        Bucket: BUCKET,
        Key: `maps/${filename}`
      }));
      const existingContent = await existing.Body.transformToString();

      // Save version
      const baseName = filename.replace('.svg', '');
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: `versions/maps/${baseName}_${timestamp}_${username || 'unknown'}.svg`,
        Body: existingContent,
        ContentType: 'image/svg+xml'
      }));
    } catch (e) {
      // New file, no version needed
    }

    // Upload new/updated file
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `maps/${filename}`,
      Body: content,
      ContentType: 'image/svg+xml'
    }));

    // Invalidate CloudFront
    await cf.send(new CreateInvalidationCommand({
      DistributionId: CF_DIST_ID,
      InvalidationBatch: {
        CallerReference: `svg-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: [`/maps/${filename}`]
        }
      }
    }));

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, filename })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

### 4.3 Create Lambda function: deleteSvg
```javascript
// lambda/deleteSvg.js
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';

const s3 = new S3Client({ region: 'us-east-1' });
const cf = new CloudFrontClient({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';
const CF_DIST_ID = 'E5SR0E5GM5GSB';

export const handler = async (event) => {
  try {
    const { filename, username } = JSON.parse(event.body);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Save version before delete
    const existing = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: `maps/${filename}`
    }));
    const content = await existing.Body.transformToString();

    const baseName = filename.replace('.svg', '');
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `versions/maps/${baseName}_${timestamp}_${username || 'unknown'}_deleted.svg`,
      Body: content,
      ContentType: 'image/svg+xml'
    }));

    // Delete file
    await s3.send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: `maps/${filename}`
    }));

    // Invalidate CloudFront
    await cf.send(new CreateInvalidationCommand({
      DistributionId: CF_DIST_ID,
      InvalidationBatch: {
        CallerReference: `svg-del-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: [`/maps/${filename}`]
        }
      }
    }));

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, deleted: filename })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

### Success Criteria
- [ ] listSvg returns all SVG files with metadata
- [ ] uploadSvg saves new files and versions existing ones
- [ ] deleteSvg creates backup version before deleting
- [ ] CloudFront cache invalidated on all operations

---

## Task 5: API Gateway Setup

**Goal**: Create REST API endpoints for Lambda functions

### 5.1 Create API Gateway REST API
```bash
# Create API
aws apigateway create-rest-api \
  --name "PrimoMapsAdmin" \
  --description "Admin API for Primo Maps" \
  --endpoint-configuration types=REGIONAL

# Note the API ID for subsequent commands
API_ID=<api-id>
```

### 5.2 Create resources and methods
```bash
# Get root resource ID
ROOT_ID=$(aws apigateway get-resources --rest-api-id $API_ID --query 'items[0].id' --output text)

# Create /api resource
aws apigateway create-resource --rest-api-id $API_ID --parent-id $ROOT_ID --path-part api
API_RESOURCE_ID=<resource-id>

# Create /api/csv resource
aws apigateway create-resource --rest-api-id $API_ID --parent-id $API_RESOURCE_ID --path-part csv

# Create /api/svg resource
aws apigateway create-resource --rest-api-id $API_ID --parent-id $API_RESOURCE_ID --path-part svg
```

### 5.3 Configure CORS
For each resource, add OPTIONS method and CORS headers.

### 5.4 Deploy API
```bash
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod
```

### API Endpoints Structure
```
POST   /api/csv      -> putCsv Lambda
GET    /api/csv      -> getCsv Lambda
GET    /api/svg      -> listSvg Lambda
POST   /api/svg      -> uploadSvg Lambda
DELETE /api/svg      -> deleteSvg Lambda
```

### Success Criteria
- [ ] API Gateway created with all endpoints
- [ ] CORS configured for admin domain
- [ ] Lambda integrations working
- [ ] API deployed to prod stage

---

## Task 6: CSV Editor Component

**Goal**: Create a bilingual CSV table editor with BiDi support

### 6.1 Create admin/components/csv-editor.js
```javascript
import i18n from '../i18n.js';
import { showToast } from './toast.js';
import { validateRow } from './validation.js';

let csvData = [];
let originalData = [];
let hasChanges = false;

export async function initCSVEditor() {
  const container = document.getElementById('csv-editor');
  container.innerHTML = renderEditor();
  await loadCSV();
  setupEditorEvents();
}

function renderEditor() {
  return `
    <div class="bg-white rounded-lg shadow p-6">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">${i18n.t('csv.title')}</h2>
        <div class="flex gap-2">
          <input type="text" id="csv-search"
            placeholder="${i18n.t('csv.search')}"
            class="px-3 py-2 border rounded">
          <button id="csv-add-row" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
            ${i18n.t('csv.addRow')}
          </button>
          <button id="csv-save" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600" disabled>
            ${i18n.t('csv.save')}
          </button>
        </div>
      </div>
      <div id="csv-table-container" class="overflow-x-auto">
        <div class="text-center py-8">${i18n.t('common.loading')}</div>
      </div>
    </div>
  `;
}

async function loadCSV() {
  try {
    const response = await fetch('/api/csv');
    const text = await response.text();
    csvData = parseCSV(text);
    originalData = JSON.parse(JSON.stringify(csvData));
    renderTable();
  } catch (error) {
    showToast(i18n.t('common.error'), 'error');
  }
}

function renderTable() {
  const container = document.getElementById('csv-table-container');
  if (csvData.length === 0) {
    container.innerHTML = '<div class="text-center py-8">No data</div>';
    return;
  }

  const headers = Object.keys(csvData[0]);

  container.innerHTML = `
    <table class="csv-table">
      <thead>
        <tr>
          ${headers.map(h => `<th>${h}</th>`).join('')}
          <th>${i18n.t('csv.deleteRow')}</th>
        </tr>
      </thead>
      <tbody>
        ${csvData.map((row, idx) => `
          <tr data-row="${idx}">
            ${headers.map(h => `
              <td>
                <input type="text"
                  dir="auto"
                  data-field="${h}"
                  value="${escapeHtml(row[h] || '')}"
                  class="w-full px-2 py-1 border rounded">
              </td>
            `).join('')}
            <td>
              <button class="delete-row text-red-500 hover:text-red-700" data-row="${idx}">
                ✕
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function setupEditorEvents() {
  // Input change tracking
  document.getElementById('csv-table-container').addEventListener('input', (e) => {
    if (e.target.matches('input[data-field]')) {
      const row = parseInt(e.target.closest('tr').dataset.row);
      const field = e.target.dataset.field;
      csvData[row][field] = e.target.value;
      markChanged();
    }
  });

  // Delete row
  document.getElementById('csv-table-container').addEventListener('click', (e) => {
    if (e.target.matches('.delete-row')) {
      const row = parseInt(e.target.dataset.row);
      if (confirm(i18n.t('svg.confirmDelete'))) {
        csvData.splice(row, 1);
        renderTable();
        markChanged();
      }
    }
  });

  // Add row
  document.getElementById('csv-add-row').addEventListener('click', () => {
    const newRow = {};
    Object.keys(csvData[0] || {}).forEach(k => newRow[k] = '');
    csvData.push(newRow);
    renderTable();
    markChanged();
  });

  // Save
  document.getElementById('csv-save').addEventListener('click', saveCSV);

  // Search
  document.getElementById('csv-search').addEventListener('input', (e) => {
    filterTable(e.target.value);
  });
}

function markChanged() {
  hasChanges = true;
  document.getElementById('csv-save').disabled = false;
}

async function saveCSV() {
  // Validate all rows
  const errors = [];
  csvData.forEach((row, idx) => {
    const rowErrors = validateRow(row);
    if (rowErrors.length > 0) {
      errors.push({ row: idx, errors: rowErrors });
    }
  });

  if (errors.length > 0) {
    showToast(i18n.t('csv.saveError'), 'error');
    // TODO: highlight error rows
    return;
  }

  try {
    const csvContent = toCSV(csvData);
    const response = await fetch('/api/csv', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvContent, username: 'admin' })
    });

    if (response.ok) {
      showToast(i18n.t('csv.saveSuccess'), 'success');
      originalData = JSON.parse(JSON.stringify(csvData));
      hasChanges = false;
      document.getElementById('csv-save').disabled = true;
    } else {
      throw new Error('Save failed');
    }
  } catch (error) {
    showToast(i18n.t('csv.saveError'), 'error');
  }
}

// Helper functions
function parseCSV(text) { /* ... */ }
function toCSV(data) { /* ... */ }
function escapeHtml(str) { /* ... */ }
function filterTable(query) { /* ... */ }
```

### Success Criteria
- [ ] CSV data loads and displays in table
- [ ] Cells are editable with BiDi support
- [ ] Add/delete rows work
- [ ] Save sends data to API
- [ ] Search/filter works
- [ ] All text is localized

---

## Task 7: SVG File Manager Component

**Goal**: Create SVG file management UI with upload/delete

### 7.1 Create admin/components/svg-manager.js
```javascript
import i18n from '../i18n.js';
import { showToast } from './toast.js';

let svgFiles = [];

export async function initSVGManager() {
  const container = document.getElementById('svg-manager');
  container.innerHTML = renderManager();
  await loadFiles();
  setupManagerEvents();
}

function renderManager() {
  return `
    <div class="bg-white rounded-lg shadow p-6">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">${i18n.t('svg.title')}</h2>
        <button id="svg-upload-btn" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
          ${i18n.t('svg.upload')}
        </button>
      </div>

      <!-- Upload dropzone -->
      <div id="upload-zone" class="hidden border-2 border-dashed border-gray-300 rounded-lg p-8 mb-4 text-center">
        <input type="file" id="file-input" accept=".svg" class="hidden">
        <p class="text-gray-500">Drop SVG file here or click to browse</p>
      </div>

      <!-- File grid -->
      <div id="svg-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="text-center py-8">${i18n.t('common.loading')}</div>
      </div>
    </div>

    <!-- Preview modal -->
    <div id="preview-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-4 max-w-4xl max-h-[90vh] overflow-auto">
        <div class="flex justify-end mb-2">
          <button id="close-preview" class="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div id="preview-content"></div>
      </div>
    </div>
  `;
}

async function loadFiles() {
  try {
    const response = await fetch('/api/svg');
    const data = await response.json();
    svgFiles = data.files;
    renderGrid();
  } catch (error) {
    showToast(i18n.t('common.error'), 'error');
  }
}

function renderGrid() {
  const grid = document.getElementById('svg-grid');

  if (svgFiles.length === 0) {
    grid.innerHTML = '<div class="col-span-3 text-center py-8 text-gray-500">No SVG files</div>';
    return;
  }

  grid.innerHTML = svgFiles.map(file => `
    <div class="border rounded-lg p-4 hover:shadow-lg transition-shadow">
      <div class="aspect-square bg-gray-100 rounded mb-2 flex items-center justify-center overflow-hidden">
        <img src="https://d3h8i7y9p8lyw7.cloudfront.net/${file.key}"
          alt="${file.name}"
          class="max-w-full max-h-full object-contain">
      </div>
      <div class="flex justify-between items-center">
        <span class="font-medium truncate" title="${file.name}">${file.name}</span>
        <span class="text-sm text-gray-500">${formatSize(file.size)}</span>
      </div>
      <div class="flex gap-2 mt-2">
        <button class="preview-btn flex-1 px-2 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
          data-key="${file.key}">
          ${i18n.t('svg.preview')}
        </button>
        <button class="delete-btn flex-1 px-2 py-1 text-sm bg-red-100 text-red-600 rounded hover:bg-red-200"
          data-name="${file.name}">
          ${i18n.t('svg.delete')}
        </button>
      </div>
    </div>
  `).join('');
}

function setupManagerEvents() {
  // Upload button
  document.getElementById('svg-upload-btn').addEventListener('click', () => {
    document.getElementById('upload-zone').classList.toggle('hidden');
  });

  // File input
  document.getElementById('file-input').addEventListener('change', handleFileSelect);
  document.getElementById('upload-zone').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  // Drag and drop
  const dropzone = document.getElementById('upload-zone');
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-blue-500', 'bg-blue-50');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-blue-500', 'bg-blue-50');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-blue-500', 'bg-blue-50');
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  });

  // Preview
  document.getElementById('svg-grid').addEventListener('click', (e) => {
    if (e.target.matches('.preview-btn')) {
      const key = e.target.dataset.key;
      showPreview(key);
    }
    if (e.target.matches('.delete-btn')) {
      const name = e.target.dataset.name;
      deleteFile(name);
    }
  });

  // Close preview
  document.getElementById('close-preview').addEventListener('click', () => {
    document.getElementById('preview-modal').classList.add('hidden');
  });
}

async function uploadFile(file) {
  if (!file.name.endsWith('.svg')) {
    showToast('Only SVG files allowed', 'error');
    return;
  }

  const content = await file.text();

  try {
    const response = await fetch('/api/svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        content,
        username: 'admin'
      })
    });

    if (response.ok) {
      showToast('File uploaded', 'success');
      document.getElementById('upload-zone').classList.add('hidden');
      await loadFiles();
    } else {
      throw new Error('Upload failed');
    }
  } catch (error) {
    showToast(i18n.t('common.error'), 'error');
  }
}

async function deleteFile(filename) {
  if (!confirm(i18n.t('svg.confirmDelete'))) return;

  try {
    const response = await fetch('/api/svg', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, username: 'admin' })
    });

    if (response.ok) {
      showToast('File deleted', 'success');
      await loadFiles();
    } else {
      throw new Error('Delete failed');
    }
  } catch (error) {
    showToast(i18n.t('common.error'), 'error');
  }
}

function showPreview(key) {
  const modal = document.getElementById('preview-modal');
  const content = document.getElementById('preview-content');
  content.innerHTML = `<img src="https://d3h8i7y9p8lyw7.cloudfront.net/${key}" class="max-w-full">`;
  modal.classList.remove('hidden');
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
```

### Success Criteria
- [ ] SVG files display in grid with thumbnails
- [ ] Upload via drag-and-drop or file picker
- [ ] Delete with confirmation
- [ ] Full-size preview modal
- [ ] All text is localized

---

## Task 8: Input Validation (Localized)

**Goal**: Implement validation rules with localized error messages

### 8.1 Create admin/components/validation.js
```javascript
import i18n from '../i18n.js';

const VALIDATION_RULES = {
  libraryName: { required: true },
  libraryNameHe: { required: true },
  collectionName: { required: true },
  collectionNameHe: { required: true },
  rangeStart: { required: true, pattern: /^[\d.]+$|^[A-Z]+\d*$/ },
  rangeEnd: { required: true, pattern: /^[\d.]+$|^[A-Z]+\d*$/ },
  svgCode: { required: true },
  floor: { required: true, pattern: /^[0-9]$/ }
};

export function validateRow(row) {
  const errors = [];

  for (const [field, rules] of Object.entries(VALIDATION_RULES)) {
    const value = row[field];

    if (rules.required && (!value || value.trim() === '')) {
      errors.push({
        field,
        message: i18n.t('validation.required')
      });
      continue;
    }

    if (rules.pattern && value && !rules.pattern.test(value)) {
      errors.push({
        field,
        message: i18n.t('validation.invalidFormat')
      });
    }
  }

  // Custom validation: rangeStart <= rangeEnd
  if (row.rangeStart && row.rangeEnd) {
    const start = parseFloat(row.rangeStart);
    const end = parseFloat(row.rangeEnd);
    if (!isNaN(start) && !isNaN(end) && start > end) {
      errors.push({
        field: 'rangeEnd',
        message: i18n.t('validation.invalidRange')
      });
    }
  }

  return errors;
}

export function showFieldError(input, message) {
  input.classList.add('border-red-500');
  const errorEl = document.createElement('span');
  errorEl.className = 'text-red-500 text-sm';
  errorEl.textContent = message;
  input.parentNode.appendChild(errorEl);
}

export function clearFieldErrors(container) {
  container.querySelectorAll('.border-red-500').forEach(el => {
    el.classList.remove('border-red-500');
  });
  container.querySelectorAll('.text-red-500.text-sm').forEach(el => {
    el.remove();
  });
}
```

### Success Criteria
- [ ] Required fields validated
- [ ] Pattern validation for numeric/code fields
- [ ] Range validation (start <= end)
- [ ] Error messages displayed in current language
- [ ] Visual indication of invalid fields

---

## Task 9: Deploy & Test Admin UI

**Goal**: Deploy admin UI to S3 and test all functionality

### 9.1 Build and deploy admin files
```bash
# Upload admin files to S3
aws s3 sync admin/ s3://tau-cenlib-primo-assets-hagay-3602/admin/ \
  --content-type "text/html" \
  --exclude "*" --include "*.html"

aws s3 sync admin/ s3://tau-cenlib-primo-assets-hagay-3602/admin/ \
  --content-type "application/javascript" \
  --exclude "*" --include "*.js"

aws s3 sync admin/ s3://tau-cenlib-primo-assets-hagay-3602/admin/ \
  --content-type "text/css" \
  --exclude "*" --include "*.css"

aws s3 sync admin/i18n/ s3://tau-cenlib-primo-assets-hagay-3602/admin/i18n/ \
  --content-type "application/json"
```

### 9.2 Update CloudFront for admin path
Configure CloudFront to serve admin files.

### 9.3 Test checklist

**Bilingual Support:**
- [ ] Hebrew UI displays correctly (RTL)
- [ ] English UI displays correctly (LTR)
- [ ] Language toggle works
- [ ] Language preference persists after refresh

**CSV Editor:**
- [ ] Data loads correctly
- [ ] Cells are editable
- [ ] Mixed Hebrew/English text displays correctly
- [ ] Add row works
- [ ] Delete row works with confirmation
- [ ] Save sends data to API
- [ ] Validation errors show in correct language

**SVG Manager:**
- [ ] Files list loads with thumbnails
- [ ] Upload via drag-and-drop works
- [ ] Upload via file picker works
- [ ] Delete works with confirmation
- [ ] Preview modal works

**General:**
- [ ] Navigation between views works
- [ ] Toast notifications appear
- [ ] API errors handled gracefully

### 9.4 Invalidate CloudFront cache
```bash
aws cloudfront create-invalidation \
  --distribution-id E5SR0E5GM5GSB \
  --paths "/admin/*"
```

### Success Criteria
- [ ] Admin UI accessible via CloudFront
- [ ] All functionality works end-to-end
- [ ] No JavaScript console errors
- [ ] Responsive on different screen sizes

---

## Files to Create Summary

```
admin/
├── index.html              # Main SPA entry
├── app.js                  # Main application logic
├── i18n.js                 # Internationalization utility
├── i18n/
│   ├── en.json             # English translations
│   └── he.json             # Hebrew translations
├── components/
│   ├── csv-editor.js       # CSV editor component
│   ├── svg-manager.js      # SVG file manager component
│   ├── toast.js            # Toast notification component
│   └── validation.js       # Validation utilities
└── styles/
    └── app.css             # Custom styles

lambda/
├── getCsv.js               # GET /api/csv
├── putCsv.js               # PUT /api/csv
├── listSvg.js              # GET /api/svg
├── uploadSvg.js            # POST /api/svg
└── deleteSvg.js            # DELETE /api/svg
```

---

## Dependencies on Other Phases

- **Phase 1** (Complete): S3 bucket, CloudFront, files uploaded
- **Phase 3** (After this): Version history UI
- **Phase 4** (After this): Authentication with Cognito
