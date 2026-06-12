"use client";

import { Download } from "lucide-react";
import { exportToExcel } from "@/lib/export/excel";
import { Button } from "@/components/ui/button";

export function ExportButton({ fileName, sheetName, rows }: { fileName: string; sheetName: string; rows: Record<string, unknown>[] }) {
  const columns = Object.keys(rows[0] ?? {}).map((key) => ({ header: key, key }));
  return (
    <Button disabled={rows.length === 0} onClick={() => void exportToExcel(fileName, sheetName, columns, rows)}>
      <Download className="h-4 w-4" />Xuất Excel
    </Button>
  );
}
