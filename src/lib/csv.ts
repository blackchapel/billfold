/**
 * Turns rows into CSV that opens safely in a spreadsheet.
 * Text that starts with = + - @ (or a tab / carriage return) would be run as a formula by Excel and Sheets, so it gets a leading
 * apostrophe. Plain numbers are left alone so amounts stay numbers. Fields with commas, quotes or line breaks are quoted.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: string[][]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`; // BOM so Excel reads ₹ and accents correctly
}
