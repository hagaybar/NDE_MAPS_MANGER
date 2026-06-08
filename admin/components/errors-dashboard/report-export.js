// admin/components/errors-dashboard/report-export.js
/**
 * Report export for the errors dashboard.
 *
 * `buildReportWorkbookModel` is a PURE description of the export sheet (rows,
 * styles, outline grouping) — no ExcelJS, fully unit-tested. `writeWorkbook` is
 * a thin adapter that maps that model onto a lazily-imported ExcelJS workbook
 * and triggers a browser download (not unit-tested on bytes; e2e/manual).
 *
 * @module components/errors-dashboard/report-export
 */

export const WORKBOOK_COLUMNS = [
  { key: 'floor', header: 'Floor', width: 8 },
  { key: 'libraryName', header: 'Library', width: 22 },
  { key: 'collectionName', header: 'Collection', width: 28 },
  { key: 'shelfLabel', header: 'Shelf', width: 12 },
  { key: 'svgCode', header: 'SVG code', width: 14 },
  { key: 'rangeStart', header: 'Range start', width: 12 },
  { key: 'rangeEnd', header: 'Range end', width: 12 },
  { key: 'csvRow', header: 'CSV row', width: 9 },
  { key: 'rootCause', header: 'Group', width: 12 },
  { key: 'affects', header: 'Affects', width: 9 },
  { key: 'category', header: 'Category', width: 12 },
  { key: 'code', header: 'Code', width: 8 },
  { key: 'severity', header: 'Severity', width: 10 },
  { key: 'message', header: 'Message', width: 90 },
];

function cells(row, extra) {
  // csvRow reads the canonical spreadsheet row number computed once in
  // overlap-clusters (#157). Fall back to rowIndex+2 only for non-overlap
  // issues that don't carry a pre-computed number.
  const csvRow = extra.rowNumber != null
    ? extra.rowNumber
    : (extra.rowIndex != null ? extra.rowIndex + 2 : '');
  return {
    floor: row?.floor ?? '',
    libraryName: row?.libraryName ?? '',
    collectionName: row?.collectionName ?? '',
    shelfLabel: row?.shelfLabel ?? '',
    svgCode: row?.svgCode ?? '',
    rangeStart: row?.rangeStart ?? '',
    rangeEnd: row?.rangeEnd ?? '',
    csvRow,
    rootCause: extra.rootCause ?? '',
    affects: extra.affects ?? '',
    category: extra.category ?? '',
    code: extra.code ?? '',
    severity: extra.severity ?? '',
    message: extra.message ?? '',
  };
}

/**
 * @param {{clusters, hubConflicts, otherOverlaps}} clusterModel - from buildOverlapClusters
 * @param {Array<{rowIndex,row,category,code,type,message}>} otherIssues - non-overlap issues
 * @param {Object[]} csvData - all rows (to resolve indices when a pair omits row refs)
 * @returns {{ columns: typeof WORKBOOK_COLUMNS, rows: Array<{cells, style, outlineLevel, blastRadius?}> }}
 *
 * All row numbers (csvRow + "Row N" in messages) read the canonical
 * spreadsheet numbers computed once in overlap-clusters, so the Excel export,
 * the on-screen view, and Print agree (#157).
 */
export function buildReportWorkbookModel(clusterModel, otherIssues = [], csvData = []) {
  const rows = [];
  const { clusters = [], hubConflicts = [], otherOverlaps = [] } = clusterModel || {};

  for (const c of clusters) {
    rows.push({
      style: 'hub',
      outlineLevel: 0,
      blastRadius: c.blastRadius,
      cells: cells(c.hubRow, {
        // #158: neutral marker (overlap is symmetric — no "root cause" framing).
        // "Affects" reads affectsShown (rows actually listed) so screen + Excel
        // agree (Phase 1 made the screen use affectsShown).
        rowNumber: c.hubRowNumber, rootCause: 'START HERE', affects: c.affectsShown,
        category: 'overlap', code: 'W001', severity: 'warning',
        message: `Overlaps ${c.affectsShown} ranges in "${c.collection}" (Floor ${c.floor})`,
      }),
    });
    for (const a of c.affected) {
      rows.push({
        style: 'affected',
        outlineLevel: 1,
        cells: cells(a.row, {
          rowNumber: a.rowNumber, category: 'overlap', code: 'W001', severity: 'warning',
          message: `Overlaps Row ${c.hubRowNumber}`,
        }),
      });
    }
  }

  // #156: both-hub overlaps that used to be dropped everywhere. Each is one
  // row keyed on its first endpoint, message refs the second endpoint.
  for (const p of hubConflicts) {
    rows.push({
      style: 'plain',
      outlineLevel: 0,
      cells: cells(p.row1 ?? csvData[p.row1Index], {
        rowNumber: p.row1Number, category: 'overlap', code: 'W001', severity: 'warning',
        message: `Overlaps wide range Row ${p.row2Number} in "${p.collection}" (Floor ${p.floor})`,
      }),
    });
  }

  for (const p of otherOverlaps) {
    rows.push({
      style: 'plain',
      outlineLevel: 0,
      cells: cells(p.row1 ?? csvData[p.row1Index], {
        rowNumber: p.row1Number, category: 'overlap', code: 'W001', severity: 'warning',
        message: `Overlaps Row ${p.row2Number} in "${p.collection}" (Floor ${p.floor})`,
      }),
    });
  }

  for (const issue of otherIssues) {
    rows.push({
      style: 'plain',
      outlineLevel: 0,
      cells: cells(issue.row, {
        rowIndex: issue.rowIndex, category: issue.category, code: issue.code,
        severity: issue.type, message: issue.message,
      }),
    });
  }

  return { columns: WORKBOOK_COLUMNS, rows };
}

/**
 * Canonical export filename. UTC date so it is timezone-stable.
 * @param {Date} [now]
 */
export function reportFilename(now = new Date()) {
  return `errors-report-${now.toISOString().slice(0, 10)}.xlsx`;
}

const STYLE = {
  hub:      { bold: true,  fill: 'FFFDE68A' },  // amber-200
  affected: { bold: false, fill: null },
  plain:    { bold: false, fill: null },
};

/**
 * Lazily load the vendored ExcelJS UMD build and resolve `window.ExcelJS`.
 *
 * The vendored file is the cdnjs UMD build (esm.sh only returned a redirect
 * stub), so it sets a `window.ExcelJS` global rather than exposing ESM exports.
 * We inject a one-time classic `<script>` and resolve once the global appears.
 * Cached on `window` so repeated exports don't re-inject.
 *
 * @returns {Promise<object>} the ExcelJS namespace (with `.Workbook`)
 */
function loadExcelJS() {
  if (typeof window !== 'undefined' && window.ExcelJS) {
    return Promise.resolve(window.ExcelJS);
  }
  if (typeof window !== 'undefined' && window.__exceljsLoading) {
    return window.__exceljsLoading;
  }
  const p = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../../vendor/exceljs.min.js', import.meta.url).href;
    script.async = true;
    script.onload = () => {
      if (window.ExcelJS) resolve(window.ExcelJS);
      else reject(new Error('ExcelJS loaded but window.ExcelJS is undefined'));
    };
    script.onerror = () => reject(new Error('Failed to load vendored ExcelJS'));
    document.head.appendChild(script);
  });
  if (typeof window !== 'undefined') window.__exceljsLoading = p;
  return p;
}

/**
 * Write the workbook model to a styled .xlsx and trigger a browser download.
 * ExcelJS is lazy-loaded here so it is not part of normal dashboard load.
 * Side-effecting; covered by e2e/manual, not unit tests.
 *
 * @param {ReturnType<typeof buildReportWorkbookModel>} model
 * @param {string} filename
 */
export async function writeWorkbook(model, filename) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Errors');

  ws.columns = model.columns.map(c => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const r of model.rows) {
    const row = ws.addRow(r.cells);
    row.outlineLevel = r.outlineLevel || 0;
    const s = STYLE[r.style] || STYLE.plain;
    if (s.bold) row.font = { bold: true };
    if (s.fill) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.fill } };
      });
    }
  }
  ws.properties.outlineLevelRow = 1;       // enable the outline
  ws.properties.summaryBelow = false;       // hub (summary) sits ABOVE its group

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
