"use client";

import { useEffect, useMemo, useState } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { Download, Plus, RefreshCcw, Save, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { exportToExcel } from "@/lib/export/excel";
import { formatMoney } from "@/lib/utils/format";
import { customerSchema, invoiceSchema, orderSchema } from "@/lib/validations/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type FieldConfig = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select";
  options?: string[];
  required?: boolean;
  hiddenOnCreate?: boolean;
};

export type ModuleConfig = {
  title: string;
  description: string;
  table: string;
  select: string;
  searchFields: string[];
  columns: { key: string; label: string; money?: boolean; badge?: boolean }[];
  fields: FieldConfig[];
  exportName: string;
  canDelete?: boolean;
};

function readPath(row: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object") return (current as Record<string, unknown>)[key];
    return undefined;
  }, row);
}

export function DataModule({ config }: { config: ModuleConfig }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  async function loadRows() {
    setLoading(true);
    const { data, error } = await supabase.from(config.table).select(config.select).order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setRows((data ?? []) as unknown as Record<string, unknown>[]);
  }

  useEffect(() => {
    void loadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return rows;
    return rows.filter((row) => config.searchFields.some((field) => String(readPath(row, field) ?? "").toLowerCase().includes(lower)));
  }, [rows, query, config.searchFields]);

  const tableColumns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    return config.columns.map((column) => ({
      id: column.key,
      header: column.label,
      accessorFn: (row) => readPath(row, column.key),
      cell: ({ getValue }) => {
        const value = getValue();
        if (column.badge) return <Badge>{String(value ?? "-")}</Badge>;
        if (column.money) return formatMoney(Number(value ?? 0));
        return String(value ?? "-");
      },
    }));
  }, [config.columns]);

  const table = useReactTable({
    data: filteredRows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  async function save(formData: FormData) {
    setMessage("");
    const payload: Record<string, unknown> = {};
    config.fields.forEach((field) => {
      const value = formData.get(field.name);
      if (field.type === "number") payload[field.name] = Number(value ?? 0);
      else payload[field.name] = value ? String(value) : null;
    });

    const schema = config.table === "customers" ? customerSchema : config.table === "orders" ? orderSchema : config.table === "invoices" ? invoiceSchema : null;
    if (schema) {
      const validation = schema.safeParse(payload);
      if (!validation.success) {
        setMessage(validation.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
        return;
      }
    }

    const result = editing?.id
      ? await supabase.from(config.table).update(payload).eq("id", String(editing.id))
      : await supabase.from(config.table).insert(payload);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    setEditing(null);
    setMessage("Đã lưu dữ liệu");
    await loadRows();
  }

  async function remove(row: Record<string, unknown>) {
    if (!confirm("Bạn chắc chắn muốn xóa dữ liệu này?")) return;
    const { error } = await supabase.from(config.table).delete().eq("id", String(row.id));
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadRows();
  }

  function renderField(field: FieldConfig) {
    if (!editing && field.hiddenOnCreate) return null;
    const defaultValue = editing ? String(editing[field.name] ?? "") : "";
    const shared = { name: field.name, defaultValue, required: field.required };
    return (
      <label key={field.name} className="space-y-2">
        <span className="text-sm font-medium">{field.label}</span>
        {field.type === "textarea" ? (
          <Textarea {...shared} />
        ) : field.type === "select" ? (
          <Select {...shared}>
            <option value="">Chọn {field.label.toLowerCase()}</option>
            {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
        ) : (
          <Input type={field.type ?? "text"} {...shared} />
        )}
      </label>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{config.title}</h1>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        <div className="flex gap-2">
          <Button className="bg-slate-900" onClick={() => void loadRows()}><RefreshCcw className="h-4 w-4" />Tải lại</Button>
          <Button onClick={() => void exportToExcel(config.exportName, config.title, config.columns.map((column) => ({ header: column.label, key: column.key })), filteredRows)}>
            <Download className="h-4 w-4" />Xuất Excel
          </Button>
        </div>
      </div>
      <Card>
        <form action={save} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {config.fields.map(renderField)}
          <div className="flex items-end gap-2">
            <Button type="submit"><Save className="h-4 w-4" />{editing ? "Cập nhật" : "Thêm mới"}</Button>
            {editing ? <Button type="button" className="bg-slate-700" onClick={() => setEditing(null)}>Hủy</Button> : <Button type="reset" className="bg-slate-700"><Plus className="h-4 w-4" />Làm mới</Button>}
          </div>
        </form>
        {message ? <p className="mt-4 rounded-md bg-muted p-3 text-sm">{message}</p> : null}
      </Card>
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm kiếm..." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                {table.getHeaderGroups().map((headerGroup) =>
                  headerGroup.headers.map((header) => (
                    <th key={header.id} className="py-3">{flexRender(header.column.columnDef.header, header.getContext())}</th>
                  )),
                )}
                <th className="py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="py-6 text-center" colSpan={config.columns.length + 1}>Đang tải dữ liệu...</td></tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr><td className="py-6 text-center" colSpan={config.columns.length + 1}>Chưa có dữ liệu</td></tr>
              ) : table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                  <td className="py-3 text-right">
                    <Button className="mr-2 h-8 bg-slate-900 px-3" onClick={() => setEditing(row.original)}>Sửa</Button>
                    {config.canDelete ? <Button className="h-8 bg-destructive px-3" onClick={() => void remove(row.original)}>Xóa</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
