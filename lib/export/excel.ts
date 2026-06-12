"use client";

import ExcelJS from "exceljs";

export type ExportColumn<T> = {
  header: string;
  key: keyof T | string;
  width?: number;
  money?: boolean;
  date?: boolean;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function exportToExcel<T extends Record<string, unknown>>(
  fileName: string,
  sheetName: string,
  columns: ExportColumn<T>[],
  rows: T[],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TP Order CRM";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: String(column.key),
    width: column.width ?? 18,
    style: column.money ? { numFmt: '#,##0 "VND"' } : undefined,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  header.alignment = { vertical: "middle" };

  rows.forEach((row) => sheet.addRow(row));

  columns.forEach((column, index) => {
    if (!column.money) return;
    sheet.getColumn(index + 1).numFmt = '#,##0 "VND"';
  });

  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
  });

  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName}-${todayKey()}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
