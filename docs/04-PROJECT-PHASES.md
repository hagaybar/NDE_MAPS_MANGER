# Project Phases

## Phase Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Phase 1    │───▶│  Phase 2    │───▶│  Phase 3    │───▶│  Phase 4    │───▶│  Phase 5    │
│  Foundation │    │  Admin UI   │    │  Versioning │    │  Auth       │    │  Integration│
│  (1 week)   │    │  (2 weeks)  │    │  (1 week)   │    │  (1 week)   │    │  (1 week)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

---

## Phase 1: Foundation & File Serving

**Goal**: Establish S3 structure and serve files to Primo NDE

### Deliverables
- [ ] S3 bucket folder structure (`/data/`, `/maps/`, `/versions/`, `/admin/`)
- [ ] Upload existing CSV mapping file
- [ ] Upload existing SVG map files
- [ ] Configure S3 bucket policy for public read on `/data/` and `/maps/`
- [ ] Configure CORS for Angular component access
- [ ] Verify CloudFront serves files correctly
- [ ] Update Angular component to fetch from CloudFront URL

### Success Criteria
- Primo NDE Angular component loads CSV and SVG from AWS
- Files are cached via CloudFront
- CORS allows requests from Primo domain

### Technical Tasks
1. Create folder structure in S3
2. Upload assets via AWS CLI:
   ```bash
   aws s3 cp mapping.csv s3://tau-cenlib-primo-assets-hagay-3602/data/
   aws s3 sync ./maps s3://tau-cenlib-primo-assets-hagay-3602/maps/
   ```
3. Set bucket policy for public read
4. Configure CORS on bucket
5. Test from Angular component

---

## Phase 2: Admin UI - File Management (Bilingual)

**Goal**: Build bilingual web interface (Hebrew/English) for managing CSV and SVG files

### Deliverables
- [ ] Admin single-page application (HTML/JS/CSS)
- [ ] **Bilingual UI framework with Hebrew/English toggle**
- [ ] **RTL layout support for Hebrew mode**
- [ ] **Translation files (`i18n/he.json`, `i18n/en.json`)**
- [ ] CSV viewer/editor with table interface (BiDi-aware)
- [ ] SVG file list with thumbnails
- [ ] File upload functionality
- [ ] File delete functionality
- [ ] Lambda functions for S3 operations
- [ ] API Gateway endpoints
- [ ] **Input validation with localized error messages**

### Success Criteria
- Non-technical user can edit CSV via web interface
- User can switch between Hebrew and English UI
- RTL layout works correctly in Hebrew mode
- Mixed Hebrew/English data displays correctly in CSV editor
- User can upload/delete SVG files
- Changes reflect immediately in CloudFront (cache invalidation)

### Technical Tasks

#### 2.1 Lambda Functions
```
/api/csv
  GET  - Read mapping.csv from S3
  PUT  - Write mapping.csv to S3, invalidate cache

/api/svg
  GET  - List SVG files with metadata
  POST - Upload new SVG file
  DELETE - Delete SVG file
```

#### 2.2 Admin Frontend (Bilingual)
- **i18n setup**: Load translations, language toggle, persist to localStorage
- **RTL/LTR switching**: CSS logical properties, `dir` attribute
- CSV table editor with BiDi support (`dir="auto"` on cells)
- SVG gallery/grid view
- Upload dialog with drag-and-drop
- Confirmation dialogs for delete operations (localized)
- **Validation error messages in Hebrew/English**

#### 2.3 BiDi Implementation
```css
/* Use logical properties for RTL compatibility */
html[dir="rtl"] {
  /* Layout automatically mirrors */
}
.sidebar { margin-inline-start: 1rem; }
.button-group { justify-content: flex-start; }
```

#### 2.4 API Gateway
- Create REST API
- Configure routes to Lambda functions
- Enable CORS for admin domain

---

## Phase 3: Version History & Data Protection

**Goal**: Implement automatic versioning and rollback capabilities

### Deliverables
- [ ] Automatic version creation on each save (CSV and SVG)
- [ ] Version history UI (list with timestamps and usernames)
- [ ] Restore/rollback functionality
- [ ] Version diff view (compare current vs previous)
- [ ] Retention policy (auto-prune old versions)
- [ ] Confirmation dialogs for destructive actions

### Success Criteria
- Every save creates a backup in `/versions/`
- Users can view list of previous versions
- Users can restore any previous version
- Old versions are automatically cleaned up
- Destructive actions require confirmation

### Technical Tasks

#### 3.1 Version Storage Lambda
```
On PUT /api/csv:
  1. GET current /data/mapping.csv
  2. COPY to /versions/data/mapping_{timestamp}_{user}.csv
  3. PUT new content to /data/mapping.csv
  4. LIST /versions/data/ and DELETE oldest if > N versions
  5. Invalidate CloudFront cache
```

#### 3.2 Version Management API
```
/api/versions/csv
  GET  - List all CSV versions with metadata

/api/versions/csv/{versionId}
  GET  - Get specific version content

/api/versions/csv/{versionId}/restore
  POST - Copy version back to /data/mapping.csv

/api/versions/svg
  GET  - List SVG versions grouped by filename

/api/versions/svg/{filename}/{versionId}/restore
  POST - Restore specific SVG version
```

#### 3.3 Version History UI
- Version list panel (timestamp, user, size)
- **Hebrew/English labels** for version history
- Preview version content before restore
- Side-by-side diff view (optional)
- Restore confirmation dialog (localized)

#### 3.4 Validation Layer
| Field | Rule | Error (HE) | Error (EN) |
|-------|------|------------|------------|
| Call Number | Required | שדה חובה | Required field |
| Location Code | Pattern match | קוד לא תקין | Invalid code |
| Map Reference | Exists in /maps/ | מפה לא קיימת | Map not found |

---

## Phase 4: Authentication & Authorization

**Goal**: Secure admin interface with user login

### Deliverables
- [ ] Cognito User Pool configuration
- [ ] **Bilingual login/logout UI**
- [ ] JWT token validation in Lambda functions
- [ ] Role-based access control (admin/editor)
- [ ] Initial admin user created
- [ ] **Username stored with each version for audit trail**

### Success Criteria
- Only authenticated users can access admin interface
- API calls require valid JWT token
- Roles correctly restrict operations
- Login UI supports Hebrew/English
- Versions include username of who made the change

### Technical Tasks

#### 4.1 Cognito Setup
- Create User Pool
- Configure app client
- Define custom attributes for roles
- Create admin user

#### 4.2 Frontend Auth (Bilingual)
- Login form (Hebrew/English)
- Session management
- Auto-logout on token expiry
- Role-based UI (show/hide features)
- Pass username to version API calls

#### 4.3 API Security
- Add Cognito authorizer to API Gateway
- Validate roles in Lambda functions
- Extract username from JWT for versioning

---

## Phase 5: Integration & Hardening

**Goal**: Complete integration with Primo NDE and production readiness

### Deliverables
- [ ] Angular component updated to use new AWS URLs
- [ ] Error handling and user feedback in admin UI
- [ ] **Comprehensive input validation**
- [ ] Export functionality (download CSV backup)
- [ ] **User guide for library staff (Hebrew)**
- [ ] Monitoring/logging setup

### Success Criteria
- End-to-end flow works in production
- Library staff can operate system independently (Hebrew UI)
- System handles errors gracefully with localized messages
- Version history provides safety net for mistakes

### Technical Tasks
- Update Primo NDE customization package
- Add CloudWatch logging to Lambdas
- Create user guide in Hebrew (with screenshots)
- Test with real users
- Document deployment/maintenance procedures
- Final validation rules review

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Free tier limits exceeded | Cost | Monitor usage, implement throttling |
| Cognito complexity | Delay | Consider simpler auth initially |
| Angular component changes | Breaking | Version API endpoints |
| Staff training | Adoption | Hebrew user guide, video tutorials |
| RTL layout bugs | UX | Test thoroughly with Hebrew content |
| Version storage bloat | Cost | Auto-prune, configurable retention |
| Data loss from user error | Data | Versioning + rollback (Phase 3) |

---

## Phase Dependencies

```
Phase 1 ──┬──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4 ──▶ Phase 5
          │
          └──▶ (Angular component can use new URLs after Phase 1)

Bilingual support: Built into Phase 2, extends through all subsequent phases
Versioning: Phase 3 adds safety net before exposing to more users in Phase 4
```

**Notes**:
- After Phase 1, the Angular component can start using AWS-hosted files
- Bilingual UI is foundational in Phase 2, carried forward
- Versioning (Phase 3) should be completed before adding more users (Phase 4)
- Phase 5 can begin in parallel with Phase 4 (some tasks are independent)
