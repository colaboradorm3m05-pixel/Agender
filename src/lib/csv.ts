/**
 * CSV no padrão que o Excel em português abre direto: separador ";", BOM
 * UTF-8 e quebras CRLF. Células que começam com = + - @ (ou tab/CR) recebem
 * apóstrofo para não serem interpretadas como fórmula (CSV injection).
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

/** Centavos como número decimal com vírgula (ex.: 4550 → "45,50"). */
export function centsForCsv(cents: number | null): string {
  if (cents === null) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
