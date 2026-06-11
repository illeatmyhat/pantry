/**
 * RFC 4180 CSV parser for the USDA distribution. Descriptions contain
 * embedded commas and `""` escapes, so naive splitting is never safe here.
 */
export type CsvRecord = Record<string, string>;

export function parseCsv(text: string): CsvRecord[] {
  const rows = parseRows(text);
  const header = rows[0];
  if (header === undefined) return [];
  return rows.slice(1).map((row) => {
    const record: CsvRecord = {};
    header.forEach((name, i) => {
      record[name] = row[i] ?? '';
    });
    return record;
  });
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ',') {
      endField();
      i += 1;
    } else if (ch === '\r') {
      i += text[i + 1] === '\n' ? 2 : 1;
      endRow();
    } else if (ch === '\n') {
      endRow();
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  // Final record when the file lacks a trailing newline.
  if (field !== '' || row.length > 0) endRow();
  return rows;
}
