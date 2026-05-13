/**
 * Report export helpers for the errors dashboard.
 *
 * Pure functions for shaping issues into export rows and serialising them
 * to CSV, plus a thin DOM helper that triggers a browser download. The
 * CSV-encoding rules mirror the toCSV / escapeCSVField helpers in
 * map-editor.js — intentional duplication for module isolation (see
 * issue-15 spec).
 *
 * @module components/errors-dashboard/report-export
 */

const COLUMNS = [
  'floor',
  'libraryName',
  'collectionName',
  'shelfLabel',
  'svgCode',
  'rangeStart',
  'rangeEnd',
  'csvRowIndex',
  'category',
  'code',
  'severity',
  'field',
  'message',
];

/**
 * Map an internal `allIssues` list to flat export rows.
 *
 * @param {Array<{type, rowIndex, row, category, code, field, message}>} allIssues
 * @returns {Array<object>}
 */
export function buildReportRows(allIssues) {
  return allIssues.map(issue => ({
    floor: issue.row?.floor ?? '',
    libraryName: issue.row?.libraryName ?? '',
    collectionName: issue.row?.collectionName ?? '',
    shelfLabel: issue.row?.shelfLabel ?? '',
    svgCode: issue.row?.svgCode ?? '',
    rangeStart: issue.row?.rangeStart ?? '',
    rangeEnd: issue.row?.rangeEnd ?? '',
    csvRowIndex: issue.rowIndex + 2,
    category: issue.category ?? '',
    code: issue.code ?? '',
    severity: issue.type ?? '',
    field: issue.field ?? '',
    message: issue.message ?? '',
  }));
}

/**
 * Wrap a value in double quotes when CSV escaping rules require it.
 * Doubles any inner double quotes. Stringifies non-strings.
 */
export function escapeCsvField(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Serialise an array of report rows to a CSV string.
 * Always emits the header row, even for empty input.
 */
export function toCsv(rows) {
  const header = COLUMNS.join(',');
  const lines = [header];
  for (const row of rows) {
    lines.push(COLUMNS.map(c => escapeCsvField(row[c] != null ? row[c] : '')).join(','));
  }
  return lines.join('\n');
}

/**
 * Build the canonical export filename for a given date.
 * Uses UTC so the filename is stable across timezones.
 *
 * @param {Date} [now] defaults to `new Date()`
 * @returns {string} e.g. "errors-report-2026-05-12.csv"
 */
export function reportFilename(now = new Date()) {
  const iso = now.toISOString().slice(0, 10);
  return `errors-report-${iso}.csv`;
}

/**
 * Trigger a browser download of `content` as `filename`.
 * Side-effecting; not unit-tested directly (covered by Playwright e2e).
 */
export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
