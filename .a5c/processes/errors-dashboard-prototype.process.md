# Errors Dashboard Prototype Process

## Overview

This process creates a validation errors dashboard as a new dedicated page/tab in the Primo Maps admin UI. The dashboard displays all validation errors and warnings from the CSV data, allowing administrators to quickly identify and fix data issues.

## Input Requirements

- **projectRoot**: `/home/hagaybar/projects/primo_maps` (default)
- **adminDir**: `admin` (default)

## Output

- New component: `admin/components/errors-dashboard.js`
- Updated files: `index.html`, `app.js`, `i18n/en.json`, `i18n/he.json`, `styles/app.css`
- A working "Errors" tab in the admin navigation

## Process Phases

### Phase 1: Design & Planning
An agent designs the component structure based on existing patterns in the codebase (validation-panel.js, location-editor.js). The design covers:
- HTML structure
- State management approach
- Event handling patterns
- Integration points

### Phase 2: Component Implementation
Creates the main `errors-dashboard.js` file with:
- `initErrorsDashboard(containerId)` initialization function
- Summary statistics section
- Filterable, sortable error list
- Navigation to problematic rows
- Bilingual support

### Phase 3: Admin Integration
Updates the admin UI to include the new dashboard:
- Adds navigation tab in `index.html`
- Updates `app.js` with view switching logic
- Wires up cross-component navigation

### Phase 4: i18n Translations
Adds all necessary translations to both English and Hebrew language files.

### Phase 5: CSS Styles
Adds dashboard-specific styles consistent with the existing admin UI design system.

### Quality Gate: User Review
A breakpoint pauses for user feedback before completing. You can:
- Test the dashboard in the browser
- Request changes or approve

## Technical Details

### Validation Rules Used
The dashboard uses the existing data-model.js validation system:

**Errors (E001-E006)**
- E001: Required field is missing
- E002: Range start must be less than or equal to range end
- E003: Floor must be 0, 1, or 2
- E004: Range start and end must have the same prefix
- E005: Duplicate entry
- E006: SVG code not found in floor map

**Warnings (W001-W003)**
- W001: Range overlaps with another entry
- W002: SVG code format is unusual
- W003: Description field is empty

### UI Features
1. **Summary Cards**: Error count, warning count, data health score
2. **Filters**: All/Errors/Warnings
3. **Sorting**: By row, type, or field
4. **Navigation**: Click error to go to row in Location Editor
5. **Export**: Download errors as CSV
6. **Refresh**: Reload and re-validate data

### Styling Approach
- Uses Tailwind CSS classes
- Custom CSS with logical properties for RTL support
- Consistent with existing validation-panel styles
- Color coding: red for errors, amber for warnings, green for healthy

## Running the Process

```bash
# Create the run with session binding
babysitter run:create \
  --process-id errors-dashboard-prototype \
  --entry .a5c/processes/errors-dashboard-prototype.js#process \
  --prompt "Build errors dashboard prototype" \
  --harness claude-code \
  --session-id <your-session-id> \
  --plugin-root /home/hagaybar/.claude/plugins/cache/a5c-ai/babysitter/4.0.143 \
  --json
```

## Expected Result

After completion, you'll have a new "Errors" tab in the admin navigation that shows:
- A summary of data quality with error/warning counts
- A grouped list of all validation issues
- Ability to filter and sort issues
- One-click navigation to fix problems

The prototype is designed for iteration - provide feedback to refine the design.
