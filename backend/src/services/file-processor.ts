import ExcelJS from 'exceljs';
import { parse as csvParse } from 'csv-parse/sync';
import crypto from 'crypto';

/** A parsed row from Excel/CSV with string keys and any values */
export interface ParsedRow {
  [key: string]: any;
}

/** Column detected from file header */
export interface DetectedColumn {
  key: string;       // sanitized key (e.g., "km_driven")
  label: string;     // original header text (e.g., "KM Driven")
  sampleValues: any[]; // first 3 non-empty values
  inferredType: 'text' | 'number' | 'date' | 'boolean';
}

/** Result from file parsing */
export interface ParseResult {
  columns: DetectedColumn[];
  rows: ParsedRow[];
  totalRows: number;
  fileHash: string;
}

export class FileProcessorService {

  /** Parse an Excel file buffer → structured data */
  async parseExcel(buffer: Buffer): Promise<ParseResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      throw new Error('Excel file is empty or has no data rows');
    }

    // Read header row
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value || `Column ${colNumber}`).trim();
    });

    if (headers.length === 0) {
      throw new Error('No headers found in Excel file');
    }

    // Read all data rows
    const rows: ParsedRow[] = [];
    for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const rowData: ParsedRow = {};
      let hasData = false;

      headers.forEach((header, idx) => {
        const cell = row.getCell(idx + 1);
        let value = cell.value;

        // Handle ExcelJS rich text and formula results
        if (value && typeof value === 'object') {
          if ('result' in value) value = value.result;
          else if ('richText' in value) value = (value as any).richText?.map((r: any) => r.text).join('') || '';
          else if ('text' in value) value = (value as any).text;
        }

        if (value !== null && value !== undefined && value !== '') {
          hasData = true;
        }
        rowData[header] = value ?? null;
      });

      if (hasData) rows.push(rowData);
    }

    const columns = this.detectColumnTypes(headers, rows);
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);

    return { columns, rows, totalRows: rows.length, fileHash };
  }

  /** Parse a CSV file buffer → structured data */
  parseCSV(buffer: Buffer): ParseResult {
    const content = buffer.toString('utf-8');
    const records = csvParse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    if (!records || records.length === 0) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const headers = Object.keys(records[0] as Record<string, unknown>);
    const rows: ParsedRow[] = records.map((r: any) => {
      const row: ParsedRow = {};
      for (const h of headers) {
        const val = r[h];
        // Try to parse numbers
        if (val !== '' && val !== null && !isNaN(Number(val))) {
          row[h] = Number(val);
        } else {
          row[h] = val || null;
        }
      }
      return row;
    });

    const columns = this.detectColumnTypes(headers, rows);
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);

    return { columns, rows, totalRows: rows.length, fileHash };
  }

  /** Detect column types from sample data */
  private detectColumnTypes(headers: string[], rows: ParsedRow[]): DetectedColumn[] {
    return headers.map(header => {
      const sampleValues = rows
        .slice(0, 10)
        .map(r => r[header])
        .filter(v => v !== null && v !== undefined && v !== '');

      const inferredType = this.inferType(sampleValues);
      const key = this.sanitizeKey(header);

      return { key, label: header, sampleValues: sampleValues.slice(0, 3), inferredType };
    });
  }

  /** Infer the data type from sample values */
  private inferType(values: any[]): 'text' | 'number' | 'date' | 'boolean' {
    if (values.length === 0) return 'text';

    const allNumbers = values.every(v => !isNaN(Number(v)));
    if (allNumbers) return 'number';

    const allBooleans = values.every(v => {
      const s = String(v).toLowerCase();
      return ['true', 'false', 'yes', 'no', '1', '0'].includes(s);
    });
    if (allBooleans) return 'boolean';

    const allDates = values.every(v => !isNaN(Date.parse(String(v))));
    if (allDates && values.length > 1) return 'date';

    return 'text';
  }

  /** Convert header text to a safe key (snake_case, no special chars) */
  private sanitizeKey(header: string): string {
    return header
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, '') || 'column';
  }

  /**
   * Map parsed rows to catalog items using a column mapping.
   * columnMapping: { "Model": "item_name", "Price": "price", "Color": "attributes.color" }
   */
  mapRowsToCatalogItems(
    rows: ParsedRow[],
    columnMapping: Record<string, string>
  ): { item_name: string; category?: string; price?: number; quantity?: number; attributes: Record<string, any> }[] {

    return rows.map(row => {
      const item: any = { attributes: {} };

      for (const [sourceColumn, targetField] of Object.entries(columnMapping)) {
        const value = row[sourceColumn];
        if (value === null || value === undefined || value === '') continue;

        if (targetField === 'item_name') {
          item.item_name = String(value);
        } else if (targetField === 'category') {
          item.category = String(value);
        } else if (targetField === 'price') {
          item.price = this.parsePrice(value);
        } else if (targetField === 'quantity') {
          item.quantity = parseInt(String(value)) || 1;
        } else if (targetField === 'ignore') {
          // Skip this column
        } else if (targetField.startsWith('attributes.')) {
          const attrKey = targetField.replace('attributes.', '');
          item.attributes[attrKey] = value;
        } else {
          // Any unmapped field goes to attributes
          item.attributes[targetField] = value;
        }
      }

      // Default quantity to 1 if not mapped
      if (item.quantity === undefined) item.quantity = 1;

      return item;
    }).filter(item => item.item_name); // Skip rows without a name
  }

  /** Parse various price formats to a number */
  private parsePrice(value: any): number | undefined {
    if (typeof value === 'number') return value;

    const str = String(value).trim().toLowerCase();

    // Remove currency symbols and commas
    const cleaned = str.replace(/[₹$,\s]/g, '');

    // Handle lakh/lakhs notation: "6.5L", "6.5 lakh", "6.5 lakhs"
    const lakhMatch = cleaned.match(/^(\d+\.?\d*)\s*(?:l|lakh|lakhs?)$/i);
    if (lakhMatch) return parseFloat(lakhMatch[1]) * 100000;

    // Handle crore notation
    const croreMatch = cleaned.match(/^(\d+\.?\d*)\s*(?:cr|crore|crores?)$/i);
    if (croreMatch) return parseFloat(croreMatch[1]) * 10000000;

    // Plain number
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num;
  }
}
