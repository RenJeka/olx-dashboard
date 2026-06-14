// Спільний Excel-експорт (ExcelJS). Перевикористовується експортом превʼю аналізу (крок 3)
// і майбутнім експортом усієї таблиці. Узгоджена єдина нова залежність — exceljs
// (замість xlsx/SheetJS: невиправлені high-severity CVE + платна модель).
import ExcelJS from 'exceljs';

/** Дефолтна ширина колонки, якщо не задано явно. */
const DEFAULT_COLUMN_WIDTH = 24;
/** Кількість заморожених згори рядків (рядок заголовків). */
const FROZEN_HEADER_ROWS = 1;

export interface XlsxColumn {
  header: string;
  /** Ключ у рядку даних. */
  key: string;
  width?: number;
}

/**
 * Будує .xlsx-буфер: заголовки + ширини колонок, заморожений рядок заголовків,
 * перенос тексту в комірках. rows — обʼєкти {key: value}.
 */
export async function buildXlsxBuffer(
  sheetName: string,
  columns: XlsxColumn[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? DEFAULT_COLUMN_WIDTH,
  }));

  // Заморожуємо рядок заголовків.
  sheet.views = [{ state: 'frozen', ySplit: FROZEN_HEADER_ROWS }];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const added = sheet.addRow(row);
    added.alignment = { wrapText: true, vertical: 'top' };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
