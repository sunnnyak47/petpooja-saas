'use strict';

/**
 * Pure bank-statement CSV parser. No DB, no prisma, no I/O.
 *
 * parseCSV(csvText) -> { lines: [{ txn_date, description, amount }], errors: [] }
 *  - txn_date:   ISO 'YYYY-MM-DD'
 *  - description: string
 *  - amount:     Number, SIGNED (+ money in, - money out)
 */

// --- CSV row splitting -------------------------------------------------------

/**
 * Split raw CSV text into an array of rows, where each row is an array of
 * field strings. Tolerates quoted fields containing commas, escaped quotes
 * ("") and newlines inside quotes. Handles \r\n and \n line endings.
 */
function splitRows(csvText) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  const text = String(csvText == null ? '' : csvText);

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // escaped quote
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\r') {
      // handle \r\n and lone \r
      if (text[i + 1] === '\n') i++;
      pushRow();
    } else if (ch === '\n') {
      pushRow();
    } else {
      field += ch;
    }
  }

  // flush trailing field/row if any content was accumulated
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}

function isRowEmpty(cells) {
  return !cells || cells.every((c) => String(c == null ? '' : c).trim() === '');
}

// --- Number parsing ----------------------------------------------------------

/**
 * Parse a numeric cell. Strips $, currency spaces and thousands commas.
 * Supports parentheses for negatives, e.g. "(5.50)" -> -5.50.
 * Returns NaN when not parseable; '' / blank -> 0.
 */
function parseAmount(raw) {
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (s === '') return 0;

  let negative = false;
  // accounting-style negative ( ... )
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  // strip currency symbols, thousands separators and spaces
  s = s.replace(/[$£€]/g, '').replace(/,/g, '').replace(/\s+/g, '');

  if (s === '' || s === '-' || s === '+') return negative ? -0 : 0;

  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;

  return negative ? -Math.abs(n) : n;
}

// --- Date parsing ------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isValidYMD(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Parse a date string into ISO 'YYYY-MM-DD'. Accepts:
 *   - YYYY-MM-DD / YYYY/MM/DD
 *   - DD/MM/YYYY, MM/DD/YYYY (prefers DD/MM/YYYY for AU), DD-MM-YYYY
 * Returns null when unparseable.
 */
function parseDate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;

  // ISO first: YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (isValidYMD(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`;
    return null;
  }

  // DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY (and 2-digit year variants)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    let a = Number(m[1]); // first component
    let b = Number(m[2]); // second component
    let y = Number(m[3]);

    if (m[3].length === 2) {
      // 2-digit year -> assume 2000s
      y += 2000;
    }

    // Prefer DD/MM/YYYY (AU). Fall back to MM/DD if day-first is invalid.
    if (isValidYMD(y, b, a)) {
      return `${y}-${pad2(b)}-${pad2(a)}`;
    }
    if (isValidYMD(y, a, b)) {
      return `${y}-${pad2(a)}-${pad2(b)}`;
    }
    return null;
  }

  return null;
}

// --- Header detection & column mapping --------------------------------------

const HEADER_KEYWORDS = [
  'date',
  'description',
  'amount',
  'debit',
  'credit',
  'narration',
  'particulars',
];

function normaliseHeader(cell) {
  return String(cell == null ? '' : cell)
    .trim()
    .toLowerCase();
}

/**
 * Decide whether a row looks like a header (contains a recognised keyword).
 */
function looksLikeHeader(cells) {
  return cells.some((c) => {
    const h = normaliseHeader(c);
    return HEADER_KEYWORDS.some((k) => h.includes(k));
  });
}

/**
 * Build a column map from a header row. Returns indices for the columns we
 * understand. Description prefers description > narration > particulars.
 */
function mapColumns(headerCells) {
  const map = {
    date: -1,
    description: -1,
    amount: -1,
    debit: -1,
    credit: -1,
  };

  headerCells.forEach((cell, idx) => {
    const h = normaliseHeader(cell);
    if (h.includes('date') && map.date === -1) map.date = idx;
    else if (h.includes('debit') && map.debit === -1) map.debit = idx;
    else if (h.includes('credit') && map.credit === -1) map.credit = idx;
    else if (h.includes('amount') && map.amount === -1) map.amount = idx;
    else if (h.includes('description') && map.description === -1)
      map.description = idx;
    else if (h.includes('narration') && map.description === -1)
      map.description = idx;
    else if (h.includes('particulars') && map.description === -1)
      map.description = idx;
  });

  return map;
}

// --- Main parser -------------------------------------------------------------

function parseCSV(csvText) {
  const result = { lines: [], errors: [] };

  let rows;
  try {
    rows = splitRows(csvText);
  } catch (e) {
    result.errors.push(`row 0: failed to split CSV (${e && e.message})`);
    return result;
  }

  if (!rows.length) return result;

  // Detect header & build column map (or default positional layout).
  let startIndex = 0;
  let colMap;

  const firstNonEmpty = rows.findIndex((r) => !isRowEmpty(r));
  if (firstNonEmpty !== -1 && looksLikeHeader(rows[firstNonEmpty])) {
    colMap = mapColumns(rows[firstNonEmpty]);
    startIndex = firstNonEmpty + 1;
  } else {
    // No recognisable header: assume order date, description, amount.
    colMap = { date: 0, description: 1, amount: 2, debit: -1, credit: -1 };
    startIndex = 0;
  }

  const hasDebitCredit = colMap.debit !== -1 || colMap.credit !== -1;

  for (let i = startIndex; i < rows.length; i++) {
    const rowNum = i + 1; // 1-based for human-readable errors
    const cells = rows[i];

    try {
      if (isRowEmpty(cells)) continue;

      // Date
      const rawDate = colMap.date !== -1 ? cells[colMap.date] : undefined;
      const txn_date = parseDate(rawDate);
      if (!txn_date) {
        result.errors.push(
          `row ${rowNum}: unparseable date "${String(
            rawDate == null ? '' : rawDate
          ).trim()}"`
        );
        continue;
      }

      // Description
      let description = '';
      if (colMap.description !== -1 && cells[colMap.description] != null) {
        description = String(cells[colMap.description]).trim();
      }

      // Amount (signed)
      let amount;
      if (hasDebitCredit) {
        const debit =
          colMap.debit !== -1 ? parseAmount(cells[colMap.debit]) : 0;
        const credit =
          colMap.credit !== -1 ? parseAmount(cells[colMap.credit]) : 0;
        if (Number.isNaN(debit) || Number.isNaN(credit)) {
          result.errors.push(`row ${rowNum}: unparseable debit/credit value`);
          continue;
        }
        // credit = money in (+), debit = money out (-)
        amount = Math.abs(credit) - Math.abs(debit);
      } else {
        const rawAmount =
          colMap.amount !== -1 ? cells[colMap.amount] : undefined;
        amount = parseAmount(rawAmount);
        if (Number.isNaN(amount)) {
          result.errors.push(
            `row ${rowNum}: unparseable amount "${String(
              rawAmount == null ? '' : rawAmount
            ).trim()}"`
          );
          continue;
        }
      }

      // normalise -0 to 0
      if (amount === 0) amount = 0;

      result.lines.push({ txn_date, description, amount });
    } catch (e) {
      result.errors.push(`row ${rowNum}: ${e && e.message ? e.message : 'parse error'}`);
    }
  }

  return result;
}

module.exports = { parseCSV };
