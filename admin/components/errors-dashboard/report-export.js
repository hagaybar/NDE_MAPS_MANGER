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
  { key: 'rootCause', header: 'Root cause', width: 12 },
  { key: 'affects', header: 'Affects', width: 9 },
  { key: 'category', header: 'Category', width: 12 },
  { key: 'code', header: 'Code', width: 8 },
  { key: 'severity', header: 'Severity', width: 10 },
  { key: 'message', header: 'Message', width: 90 },
];

function cells(row, extra) {
  return {
    floor: row?.floor ?? '',
    libraryName: row?.libraryName ?? '',
    collectionName: row?.collectionName ?? '',
    shelfLabel: row?.shelfLabel ?? '',
    svgCode: row?.svgCode ?? '',
    rangeStart: row?.rangeStart ?? '',
    rangeEnd: row?.rangeEnd ?? '',
    csvRow: extra.rowIndex != null ? extra.rowIndex + 2 : '',
    rootCause: extra.rootCause ?? '',
    affects: extra.affects ?? '',
    category: extra.category ?? '',
    code: extra.code ?? '',
    severity: extra.severity ?? '',
    message: extra.message ?? '',
  };
}

/**
 * @param {{clusters, otherOverlaps}} clusterModel - from buildOverlapClusters
 * @param {Array<{rowIndex,row,category,code,type,message}>} otherIssues - non-overlap issues
 * @param {Object[]} csvData - all rows (to resolve otherOverlaps indices)
 * @returns {{ columns: typeof WORKBOOK_COLUMNS, rows: Array<{cells, style, outlineLevel, blastRadius?}> }}
 */
export function buildReportWorkbookModel(clusterModel, otherIssues = [], csvData = []) {
  const rows = [];
  const { clusters = [], otherOverlaps = [] } = clusterModel || {};

  for (const c of clusters) {
    rows.push({
      style: 'hub',
      outlineLevel: 0,
      blastRadius: c.blastRadius,
      cells: cells(c.hubRow, {
        rowIndex: c.hubRowIndex, rootCause: 'ROOT CAUSE', affects: c.blastRadius,
        category: 'overlap', code: 'W001', severity: 'warning',
        message: `Overlaps ${c.blastRadius} ranges in "${c.collection}" (Floor ${c.floor})`,
      }),
    });
    for (const a of c.affected) {
      rows.push({
        style: 'affected',
        outlineLevel: 1,
        cells: cells(a.row, {
          rowIndex: a.rowIndex, category: 'overlap', code: 'W001', severity: 'warning',
          message: `Overlaps root-cause Row ${c.hubRowIndex + 2}`,
        }),
      });
    }
  }

  for (const p of otherOverlaps) {
    rows.push({
      style: 'plain',
      outlineLevel: 0,
      cells: cells(csvData[p.row1Index], {
        rowIndex: p.row1Index, category: 'overlap', code: 'W001', severity: 'warning',
        message: `Overlaps Row ${p.row2Index + 2} in "${p.collection}" (Floor ${p.floor})`,
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
