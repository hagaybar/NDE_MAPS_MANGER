# Architecture Design

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              END USERS                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────────┐                    ┌──────────────────────────┐  │
│   │   Primo NDE      │                    │   Admin/Editor Users     │  │
│   │   (Angular)      │                    │   (Browser)              │  │
│   └────────┬─────────┘                    └────────────┬─────────────┘  │
│            │                                           │                 │
│            │ GET CSV/SVG                               │ Login/Edit      │
│            ▼                                           ▼                 │
├─────────────────────────────────────────────────────────────────────────┤
│                              AWS CLOUD                                   │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │                        CloudFront CDN                             │  │
│   │   (tau-cenlib-primo-assets-hagay-3602.cloudfront.net)            │  │
│   └────────────────────────────┬─────────────────────────────────────┘  │
│                                │                                         │
│                                ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                         S3 Bucket                                │   │
│   │            tau-cenlib-primo-assets-hagay-3602                    │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │   │
│   │  │  /maps/     │  │  /data/     │  │  /admin/                │  │   │
│   │  │  *.svg      │  │  mapping.csv│  │  index.html, app.js     │  │   │
│   │  │  (public)   │  │  (public)   │  │  (protected via Cognito)│  │   │
│   │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐     │
│   │   API Gateway    │  │   Lambda         │  │   Cognito         │     │
│   │   (REST API)     │◄─┤   Functions      │◄─┤   User Pool       │     │
│   │                  │  │   - updateCSV    │  │   - admin role    │     │
│   │   /api/csv       │  │   - uploadSVG    │  │   - editor role   │     │
│   │   /api/svg       │  │   - deleteSVG    │  │                   │     │
│   └──────────────────┘  └──────────────────┘  └───────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack Recommendation

### Frontend (Admin Interface)
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | Vanilla JS or Alpine.js | Minimal bundle, no build step needed |
| UI Library | Tailwind CSS (CDN) | Clean UI without complexity |
| CSV Editor | Handsontable or AG-Grid (free tier) | Spreadsheet-like editing |
| Hosting | S3 + CloudFront | Already configured |

### Backend
| Component | Technology | Rationale |
|-----------|------------|-----------|
| API | API Gateway + Lambda | Serverless, free tier eligible |
| Runtime | Python 3.x or Node.js | Simple Lambda functions |
| Authentication | Amazon Cognito | Free tier: 50k MAU |
| Storage | S3 | Already configured |
| CDN | CloudFront | Already configured |

### Why Serverless?
- **Zero server maintenance** - No EC2 instances to manage
- **Free tier friendly** - Lambda: 1M requests/month free
- **Auto-scaling** - Handles traffic spikes automatically
- **Pay-per-use** - Only pay when functions execute

---

## 3. Data Flow

### 3.1 Primo NDE Reads Assets (Public)
```
Primo Angular Component
        │
        │ GET /data/mapping.csv
        │ GET /maps/{library}.svg
        ▼
   CloudFront (Cache)
        │
        │ Cache Miss
        ▼
   S3 Bucket (Origin)
```

### 3.2 Admin Updates CSV
```
Admin Browser
        │
        │ 1. Login (Cognito)
        ▼
   Cognito User Pool
        │
        │ 2. JWT Token
        ▼
Admin Browser
        │
        │ 3. PUT /api/csv (with JWT)
        ▼
   API Gateway
        │
        │ 4. Authorize (check JWT)
        ▼
   Lambda: updateCSV
        │
        │ 5. Write to S3
        │ 6. Invalidate CloudFront cache
        ▼
   S3 + CloudFront
```

---

## 4. S3 Bucket Structure

```
tau-cenlib-primo-assets-hagay-3602/
├── data/
│   └── mapping.csv              # Location mapping data (current/live)
├── maps/
│   ├── library-floor1.svg       # SVG map files (current/live)
│   ├── library-floor2.svg
│   └── ...
├── versions/                    # Version history (protected, not public)
│   ├── data/
│   │   ├── mapping_2024-01-15T10-30-00_user@email.csv
│   │   ├── mapping_2024-01-14T09-15-00_user@email.csv
│   │   └── ...
│   └── maps/
│       ├── library-floor1_2024-01-10T14-00-00_user@email.svg
│       └── ...
├── admin/
│   ├── index.html               # Admin SPA entry point
│   ├── app.js                   # Admin application code
│   ├── styles.css               # Admin styles
│   └── i18n/                    # Localization files
│       ├── he.json              # Hebrew translations
│       └── en.json              # English translations
└── index.html                   # Public landing/redirect
```

---

## 5. Security Model

### Public Access (No Auth)
- `GET /data/mapping.csv`
- `GET /maps/*.svg`

### Protected Access (Cognito Auth)
- `GET /admin/*` - Redirects to login if not authenticated
- `PUT /api/csv` - Requires valid JWT with editor/admin role
- `POST /api/svg` - Requires valid JWT with editor/admin role
- `DELETE /api/svg` - Requires valid JWT with editor/admin role

### Roles
| Role | Permissions |
|------|-------------|
| admin | All operations + user management |
| editor | Edit CSV, upload/delete SVG files |

---

## 6. AWS Services & Free Tier Usage

| Service | Free Tier Limit | Expected Usage |
|---------|-----------------|----------------|
| S3 | 5GB storage, 20k GET, 2k PUT | ~100MB, low writes |
| CloudFront | 1TB transfer, 10M requests | ~1GB/month |
| Lambda | 1M requests, 400k GB-sec | < 10k requests |
| API Gateway | 1M API calls | < 10k calls |
| Cognito | 50k MAU | < 10 users |

---

## 7. Bilingual Support (Hebrew-English)

### 7.1 UI Localization Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Admin Interface                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  [EN | עב]  Language Toggle                         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  dir="rtl" when Hebrew    │    dir="ltr" when English       │
│  ─────────────────────────┼──────────────────────────────   │
│  CSS logical properties   │    Standard CSS                 │
│  (margin-inline-start)    │    (margin-left)                │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Implementation Approach

| Aspect | Implementation |
|--------|----------------|
| **Translations** | JSON files (`i18n/he.json`, `i18n/en.json`) |
| **RTL Layout** | CSS logical properties + `dir` attribute on `<html>` |
| **Language Toggle** | Stored in `localStorage`, persists across sessions |
| **Mixed Content** | Use `<bdi>` tags for user-generated content |
| **Date Format** | Hebrew: DD/MM/YYYY, English: MM/DD/YYYY |
| **Numbers** | Western numerals in both languages |

### 7.3 BiDi Considerations

```javascript
// Example: handling mixed Hebrew/English in CSV data
<td dir="auto">  <!-- Browser auto-detects direction per cell -->
  <bdi>{cellContent}</bdi>  <!-- Isolate bidirectional text -->
</td>
```

**CSS Logical Properties** (RTL-compatible):
```css
/* Instead of margin-left/right, use: */
.element {
  margin-inline-start: 1rem;  /* Left in LTR, Right in RTL */
  margin-inline-end: 1rem;    /* Right in LTR, Left in RTL */
  text-align: start;          /* Respects document direction */
}
```

### 7.4 Translation File Structure

```json
// i18n/he.json
{
  "app": {
    "title": "ניהול מפות מדפים",
    "logout": "התנתק"
  },
  "csv": {
    "save": "שמור",
    "cancel": "ביטול",
    "addRow": "הוסף שורה",
    "deleteRow": "מחק שורה",
    "validation": {
      "required": "שדה חובה",
      "invalidFormat": "פורמט לא תקין"
    }
  },
  "versions": {
    "history": "היסטוריית גרסאות",
    "restore": "שחזר",
    "compare": "השווה"
  }
}
```

---

## 8. Version History & Data Protection

### 8.1 Versioning Strategy

```
On Save (CSV or SVG):
┌──────────────┐
│ User clicks  │
│   "Save"     │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Lambda: saveWithVersion              │
│  1. Copy current file → /versions/   │
│     (with timestamp + username)      │
│  2. Write new file to live location  │
│  3. Prune old versions (keep N)      │
│  4. Invalidate CloudFront cache      │
└──────────────────────────────────────┘
```

### 8.2 Version Naming Convention

```
Format: {filename}_{ISO-timestamp}_{username}.{ext}

Examples:
  mapping_2024-01-15T10-30-00Z_admin@tau.ac.il.csv
  library-floor1_2024-01-10T14-00-00Z_editor@tau.ac.il.svg
```

### 8.3 Version Management API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/versions/csv` | GET | List CSV versions (with metadata) |
| `/api/versions/csv/{version}` | GET | Get specific CSV version content |
| `/api/versions/csv/{version}/restore` | POST | Restore CSV to this version |
| `/api/versions/svg` | GET | List all SVG file versions |
| `/api/versions/svg/{filename}/{version}` | GET | Get specific SVG version |
| `/api/versions/svg/{filename}/{version}/restore` | POST | Restore SVG to this version |

### 8.4 Data Flow: Save with Versioning

```
Admin Browser                    Lambda                         S3
     │                              │                            │
     │ PUT /api/csv                 │                            │
     │  { data, comment }           │                            │
     │─────────────────────────────▶│                            │
     │                              │                            │
     │                              │ 1. GET current file        │
     │                              │───────────────────────────▶│
     │                              │◀───────────────────────────│
     │                              │                            │
     │                              │ 2. PUT to /versions/       │
     │                              │───────────────────────────▶│
     │                              │                            │
     │                              │ 3. PUT new file to /data/  │
     │                              │───────────────────────────▶│
     │                              │                            │
     │                              │ 4. List old versions       │
     │                              │───────────────────────────▶│
     │                              │◀───────────────────────────│
     │                              │                            │
     │                              │ 5. DELETE excess versions  │
     │                              │───────────────────────────▶│
     │                              │                            │
     │◀─────────────────────────────│                            │
     │  { success, versionId }      │                            │
```

### 8.5 Input Validation Rules

| Field | Validation | Error Message (HE) |
|-------|------------|-------------------|
| Call Number | Required, non-empty | מספר קריאה נדרש |
| Location Code | Must match pattern | קוד מיקום לא תקין |
| Map File | Must exist in /maps/ | קובץ מפה לא נמצא |
| Coordinates | Numeric, within bounds | קואורדינטות לא תקינות |

### 8.6 Retention Policy

- **Default retention**: 20 versions per file
- **Configurable**: Admin can adjust via settings
- **Auto-cleanup**: Lambda prunes oldest versions on each save
- **Storage estimate**: ~50KB per CSV version × 20 = ~1MB for CSV history

---

## 9. Alternative Approaches Considered

### Option A: Full Static (No Lambda)
- **Approach**: Admin edits CSV in browser, uploads directly to S3
- **Pros**: Simpler, fewer moving parts
- **Cons**: Requires S3 signed URLs, more complex client-side auth
- **Verdict**: Viable but less secure

### Option B: Amplify
- **Approach**: Use AWS Amplify for full-stack
- **Pros**: Faster development, built-in auth
- **Cons**: More complex, potential vendor lock-in, harder to customize
- **Verdict**: Overkill for this use case

### Option C: External Backend (Vercel/Netlify)
- **Approach**: Use external service for admin UI
- **Pros**: Easier development
- **Cons**: Another service to manage, potential costs
- **Verdict**: Unnecessary given existing AWS setup
