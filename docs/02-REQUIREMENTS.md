# Requirements Document

## 1. Functional Requirements

### 1.1 File Storage & Serving

| ID | Requirement | Priority |
|----|-------------|----------|
| FS-01 | Store CSV mapping file in S3 | Must |
| FS-02 | Store SVG map files in S3 | Must |
| FS-03 | Serve files via CloudFront CDN | Must |
| FS-04 | Support CORS for Angular component access | Must |
| FS-05 | Cache invalidation when files are updated | Should |

### 1.2 CSV Mapping Editor

| ID | Requirement | Priority |
|----|-------------|----------|
| CE-01 | Display CSV data in editable table/grid format | Must |
| CE-02 | Add new mapping rows | Must |
| CE-03 | Edit existing mapping rows | Must |
| CE-04 | Delete mapping rows | Must |
| CE-05 | Save changes to S3 | Must |
| CE-06 | Validate data before saving | Should |
| CE-07 | Show validation errors inline | Should |
| CE-08 | Undo/redo functionality | Could |
| CE-09 | Search/filter rows | Could |
| CE-10 | Export CSV for backup | Could |

### 1.3 SVG File Management

| ID | Requirement | Priority |
|----|-------------|----------|
| SM-01 | List all SVG files with preview thumbnails | Must |
| SM-02 | Upload new SVG files | Must |
| SM-03 | Replace existing SVG files | Must |
| SM-04 | Delete SVG files | Must |
| SM-05 | Validate file is valid SVG before upload | Should |
| SM-06 | Show file metadata (size, upload date) | Should |
| SM-07 | Preview SVG in full size | Could |

### 1.4 User Authentication & Authorization

| ID | Requirement | Priority |
|----|-------------|----------|
| UA-01 | User login with username/password | Must |
| UA-02 | Admin role: full access | Must |
| UA-03 | Editor role: edit CSV, manage SVG files | Must |
| UA-04 | Secure session management | Must |
| UA-05 | Password reset functionality | Should |
| UA-06 | Audit log of changes | Could |

### 1.5 Bilingual Support (Hebrew-English)

| ID | Requirement | Priority |
|----|-------------|----------|
| BL-01 | Admin UI supports Hebrew interface | Must |
| BL-02 | RTL (right-to-left) layout for Hebrew mode | Must |
| BL-03 | Language toggle (Hebrew/English) | Must |
| BL-04 | Persist user language preference | Should |
| BL-05 | Support mixed Hebrew/English content in data fields | Must |
| BL-06 | Proper BiDi text rendering in CSV editor | Must |
| BL-07 | Hebrew labels, buttons, and error messages | Must |
| BL-08 | Date/number formatting per locale | Should |

### 1.6 Data Protection & Version History

| ID | Requirement | Priority |
|----|-------------|----------|
| DP-01 | Automatic versioning of CSV file on each save | Must |
| DP-02 | Automatic versioning of SVG files on replace | Must |
| DP-03 | View list of previous versions with timestamps | Must |
| DP-04 | Restore (rollback) to any previous version | Must |
| DP-05 | Compare current vs previous version (diff view) | Should |
| DP-06 | Retain last N versions (configurable, default: 20) | Must |
| DP-07 | Input validation rules for CSV columns | Must |
| DP-08 | Prevent saving invalid data | Must |
| DP-09 | Confirmation dialog before destructive actions | Must |
| DP-10 | Show who made each change (audit trail) | Should |

---

## 2. Non-Functional Requirements

### 2.1 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NF-01 | CSV/SVG file load time | < 2 seconds |
| NF-02 | CloudFront cache hit ratio | > 90% |
| NF-03 | Admin UI page load | < 3 seconds |

### 2.2 Scalability

| ID | Requirement | Notes |
|----|-------------|-------|
| NF-04 | Handle concurrent Primo users | ~100-500 simultaneous |
| NF-05 | Stay within AWS free tier | 1M requests/month, 1GB storage |

### 2.3 Security

| ID | Requirement | Priority |
|----|-------------|----------|
| NF-06 | HTTPS for all communications | Must |
| NF-07 | Secure credential storage | Must |
| NF-08 | Public read access for assets only | Must |
| NF-09 | Admin interface protected | Must |

### 2.4 Maintainability

| ID | Requirement | Notes |
|----|-------------|-------|
| NF-10 | Infrastructure as Code | Reproducible deployment |
| NF-11 | Clear documentation | For handoff/maintenance |
| NF-12 | Minimal operational overhead | Serverless preferred |

---

## 3. Constraints

### 3.1 Technical Constraints
- Work within AWS free tier limits (preferable)
- Must integrate with existing Primo NDE Angular component
- CloudFront distribution already exists

### 3.2 Business Constraints
- Non-technical users must be able to operate the system
- Minimal ongoing maintenance required
- No budget for paid services

---

## 4. Assumptions

1. The existing CSV format will remain stable
2. SVG files are reasonably sized (< 1MB each)
3. Number of maps is limited (< 50 files)
4. Traffic from Primo NDE is within free tier limits
5. AWS free tier will remain available

---

## 5. Out of Scope

- Automated map generation
- Integration with other library systems
- Mobile-specific admin interface
- Languages beyond Hebrew and English
- Real-time collaborative editing
