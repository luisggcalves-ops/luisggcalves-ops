/**
 * CSV with Excel-safe escaping. Cells that start with = + - @ are prefixed with
 * an apostrophe, so a customer's name can't become a spreadsheet formula
 * (CSV injection).
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          let s = v === null || v === undefined ? "" : String(v);
          if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}
