"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, RefreshCcw, Save, Search, Trash2 } from "lucide-react";
import type { UserRole } from "@/lib/types/database";
import { FILE_BUCKET, INVOICE_TYPES } from "@/lib/constants/app";
import { exportToExcel } from "@/lib/export/excel";
import { createAdminNotification, writeAuditLog } from "@/lib/notifications/admin-notifications";
import { sanitizeFileName } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/browser";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { validateUploadFile } from "@/lib/validations/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type BranchOption = { id: string; name: string };
type CustomerOption = { id: string; customer_code: string; name: string; phone: string; branch_id: string | null };
type OrderOption = {
  id: string;
  order_code: string;
  customer_id: string | null;
  branch_id: string | null;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  customers?: { name: string | null; phone: string | null; customer_code: string | null } | null;
  branches?: { name: string | null } | null;
};
type OrderFileOption = {
  id: string;
  order_id: string;
  file_type: string;
  file_name: string | null;
  file_path: string;
  file_url: string;
};
type InvoiceRow = {
  id: string;
  invoice_code: string;
  invoice_type: string;
  order_id: string | null;
  customer_id: string | null;
  branch_id: string | null;
  supplier_name: string | null;
  amount: number | string | null;
  invoice_date: string | null;
  content: string | null;
  note: string | null;
  file_path: string | null;
  file_url: string | null;
  file_name: string | null;
  linked_order_file_id: string | null;
  customers?: { name: string | null; phone: string | null } | null;
  branches?: { name: string | null } | null;
  orders?: { order_code: string | null; customers?: { name: string | null; phone: string | null } | null; branches?: { name: string | null } | null } | null;
  linked_order_file?: { file_name: string | null; file_path: string | null; file_url: string | null; file_type: string | null } | null;
};

type FormState = {
  invoice_type: "Đầu vào" | "Đầu ra";
  order_id: string;
  customer_id: string;
  branch_id: string;
  supplier_name: string;
  amount: string;
  invoice_date: string;
  content: string;
  note: string;
  linked_order_file_id: string;
};

const today = new Date().toISOString().slice(0, 10);
const initialForm: FormState = {
  invoice_type: "Đầu ra",
  order_id: "",
  customer_id: "",
  branch_id: "",
  supplier_name: "",
  amount: "",
  invoice_date: today,
  content: "",
  note: "",
  linked_order_file_id: "",
};

export function InvoicesModule({ role, branchId }: { role: UserRole; branchId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const canCreate = role === "admin" || role === "branch_manager";
  const canEdit = role === "admin" || role === "branch_manager";
  const canDelete = role === "admin";
  const canUseBranchFilter = role === "admin";
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [orderFiles, setOrderFiles] = useState<OrderFileOption[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>({ ...initialForm, branch_id: role === "branch_manager" ? branchId ?? "" : "" });
  const [inputInvoiceFile, setInputInvoiceFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<InvoiceRow | null>(null);
  const [query, setQuery] = useState("");
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState(role === "branch_manager" ? branchId ?? "" : "");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    const [invoiceResult, branchResult, customerResult, orderResult, orderFileResult] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_code, invoice_type, order_id, customer_id, branch_id, supplier_name, amount, invoice_date, content, note, file_path, file_url, file_name, linked_order_file_id, customers(name, phone), branches(name), orders(order_code, customers(name, phone), branches(name)), linked_order_file:order_files!invoices_linked_order_file_id_fkey(file_name, file_path, file_url, file_type)")
        .order("created_at", { ascending: false }),
      supabase.from("branches").select("id, name").order("name"),
      supabase.from("customers").select("id, customer_code, name, phone, branch_id").order("name"),
      supabase.from("orders").select("id, order_code, customer_id, branch_id, total_amount, paid_amount, customers(name, phone, customer_code), branches(name)").order("created_at", { ascending: false }),
      supabase.from("order_files").select("id, order_id, file_type, file_name, file_path, file_url").order("created_at", { ascending: false }),
    ]);
    setLoading(false);

    const firstError = invoiceResult.error ?? branchResult.error ?? customerResult.error ?? orderResult.error ?? orderFileResult.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }

    const invoiceRows = (invoiceResult.data ?? []) as unknown as InvoiceRow[];
    setInvoices(invoiceRows);
    setBranches((branchResult.data ?? []) as BranchOption[]);
    setCustomers((customerResult.data ?? []) as CustomerOption[]);
    setOrders((orderResult.data ?? []) as unknown as OrderOption[]);
    setOrderFiles((orderFileResult.data ?? []) as OrderFileOption[]);

    const paths = invoiceRows.flatMap((invoice) => {
      const entries: { id: string; path: string; fallback: string }[] = [];
      if (invoice.file_path) entries.push({ id: `invoice-${invoice.id}`, path: invoice.file_path, fallback: invoice.file_url ?? "" });
      if (invoice.linked_order_file?.file_path) entries.push({ id: `order-file-${invoice.id}`, path: invoice.linked_order_file.file_path, fallback: invoice.linked_order_file.file_url ?? "" });
      return entries;
    });
    const signedEntries = await Promise.all(paths.map(async (item) => {
      const { data } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(item.path, 60 * 10);
      return [item.id, data?.signedUrl ?? item.fallback] as const;
    }));
    setSignedUrls(Object.fromEntries(signedEntries));
  }

  useEffect(() => {
    void loadData();
  }, []);

  const isInputInvoice = form.invoice_type === "Đầu vào";
  const currentBranchId = role === "branch_manager" ? branchId ?? "" : form.branch_id;
  const customerOptions = customers.filter((customer) => !currentBranchId || customer.branch_id === currentBranchId);
  const orderOptions = orders.filter((order) => !currentBranchId || order.branch_id === currentBranchId);
  const selectedOrder = orders.find((order) => order.id === form.order_id);
  const selectedCustomer = customers.find((customer) => customer.id === form.customer_id);
  const selectedBranch = branches.find((branch) => branch.id === form.branch_id);
  const relatedOrderFiles = orderFiles.filter((file) => file.order_id === form.order_id);

  const filteredInvoices = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const orderCode = invoice.orders?.order_code ?? "";
      const customerName = invoice.orders?.customers?.name ?? invoice.customers?.name ?? "";
      const customerPhone = invoice.orders?.customers?.phone ?? invoice.customers?.phone ?? "";
      const matchesQuery =
        !keyword ||
        invoice.invoice_code.toLowerCase().includes(keyword) ||
        orderCode.toLowerCase().includes(keyword) ||
        customerName.toLowerCase().includes(keyword) ||
        customerPhone.toLowerCase().includes(keyword) ||
        String(invoice.supplier_name ?? "").toLowerCase().includes(keyword);
      const matchesType = !invoiceTypeFilter || invoice.invoice_type === invoiceTypeFilter;
      const matchesBranch = !branchFilter || invoice.branch_id === branchFilter;
      const invoiceDate = invoice.invoice_date ?? "";
      const matchesFromDate = !fromDate || invoiceDate >= fromDate;
      const matchesToDate = !toDate || invoiceDate <= toDate;
      return matchesQuery && matchesType && matchesBranch && matchesFromDate && matchesToDate;
    });
  }, [invoices, query, invoiceTypeFilter, branchFilter, fromDate, toDate]);

  async function exportInvoices() {
    await exportToExcel("hoa-don", "Hóa đơn", [
      { header: "Mã hóa đơn", key: "Mã hóa đơn", width: 18 },
      { header: "Loại hóa đơn", key: "Loại hóa đơn", width: 18 },
      { header: "Mã đơn hàng", key: "Mã đơn hàng", width: 18 },
      { header: "Khách hàng", key: "Khách hàng", width: 28 },
      { header: "Số điện thoại", key: "Số điện thoại", width: 18 },
      { header: "Nhà cung cấp / Công ty bán", key: "Nhà cung cấp / Công ty bán", width: 30 },
      { header: "Chi nhánh", key: "Chi nhánh", width: 24 },
      { header: "Ngày hóa đơn", key: "Ngày hóa đơn", width: 14 },
      { header: "Số tiền", key: "Số tiền", money: true, width: 18 },
      { header: "Nội dung", key: "Nội dung", width: 32 },
      { header: "Ghi chú", key: "Ghi chú", width: 32 },
      { header: "Link file", key: "Link file", width: 42 },
    ], filteredInvoices.map((invoice) => ({
      "Mã hóa đơn": invoice.invoice_code,
      "Loại hóa đơn": invoice.invoice_type,
      "Mã đơn hàng": invoice.orders?.order_code ?? "",
      "Khách hàng": invoice.orders?.customers?.name ?? invoice.customers?.name ?? "",
      "Số điện thoại": invoice.orders?.customers?.phone ?? invoice.customers?.phone ?? "",
      "Nhà cung cấp / Công ty bán": invoice.supplier_name ?? "",
      "Chi nhánh": invoice.orders?.branches?.name ?? invoice.branches?.name ?? "",
      "Ngày hóa đơn": invoice.invoice_date ?? "",
      "Số tiền": Number(invoice.amount ?? 0),
      "Nội dung": invoice.content ?? "",
      "Ghi chú": invoice.note ?? "",
      "Link file": invoice.linked_order_file?.file_url ?? invoice.file_url ?? "",
    })));
  }

  function updateForm(name: keyof FormState, value: string) {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "invoice_type") {
        next.order_id = "";
        next.customer_id = "";
        next.supplier_name = "";
        next.linked_order_file_id = "";
        next.branch_id = role === "branch_manager" ? branchId ?? "" : "";
      }
      if (name === "branch_id") {
        next.customer_id = "";
        next.order_id = "";
        next.linked_order_file_id = "";
      }
      if (name === "order_id") {
        const order = orders.find((item) => item.id === value);
        if (order) {
          next.customer_id = order.customer_id ?? "";
          next.branch_id = order.branch_id ?? "";
          next.amount = String(Number(order.paid_amount ?? 0) > 0 ? order.paid_amount : order.total_amount ?? 0);
          next.linked_order_file_id = "";
        }
      }
      return next;
    });
  }

  function resetForm() {
    setEditing(null);
    setMessage("");
    setInputInvoiceFile(null);
    setForm({ ...initialForm, branch_id: role === "branch_manager" ? branchId ?? "" : "" });
  }

  function startEdit(invoice: InvoiceRow) {
    setEditing(invoice);
    setMessage("");
    setInputInvoiceFile(null);
    setForm({
      invoice_type: invoice.invoice_type === "Đầu vào" ? "Đầu vào" : "Đầu ra",
      order_id: invoice.order_id ?? "",
      customer_id: invoice.customer_id ?? "",
      branch_id: invoice.branch_id ?? "",
      supplier_name: invoice.supplier_name ?? "",
      amount: String(invoice.amount ?? 0),
      invoice_date: invoice.invoice_date ?? today,
      content: invoice.content ?? "",
      note: invoice.note ?? "",
      linked_order_file_id: invoice.linked_order_file_id ?? "",
    });
  }

  function validateForm() {
    if (!form.invoice_type) return "Vui lòng chọn loại hóa đơn";
    if (!form.invoice_date) return "Vui lòng chọn ngày hóa đơn";
    if (Number(form.amount || 0) <= 0) return "Số tiền phải lớn hơn 0";
    if (form.invoice_type === "Đầu vào") {
      if (!form.supplier_name.trim()) return "Vui lòng nhập nhà cung cấp/công ty bán";
      if (!form.branch_id) return "Vui lòng chọn chi nhánh nhập";
    } else {
      if (!form.order_id) return "Vui lòng chọn đơn hàng liên quan";
    }
    return "";
  }

  async function uploadInputInvoiceFile(invoiceId: string, invoiceBranchId: string, file: File) {
    const validation = validateUploadFile(file);
    if (validation) throw new Error(validation);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");

    const storageFileName = `${Date.now()}-${sanitizeFileName(file.name)}`;
    const filePath = `branch/${invoiceBranchId}/invoices/${invoiceId}/${storageFileName}`;
    const uploadResult = await supabase.storage.from(FILE_BUCKET).upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (uploadResult.error) throw new Error(`Không thể tải file: ${uploadResult.error.message}`);

    const { data } = supabase.storage.from(FILE_BUCKET).getPublicUrl(filePath);
    const updateResult = await supabase.from("invoices").update({
      file_url: data.publicUrl,
      file_path: filePath,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: user.id,
    }).eq("id", invoiceId);

    if (updateResult.error) {
      await supabase.storage.from(FILE_BUCKET).remove([filePath]);
      throw new Error(`Không thể lưu file hóa đơn: ${updateResult.error.message}`);
    }
  }

  async function saveInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!editing && !canCreate) || (editing && !canEdit)) return;
    setSaving(true);
    setError("");
    setMessage("");

    const validationMessage = validateForm();
    if (validationMessage) {
      setSaving(false);
      setError(validationMessage);
      return;
    }

    const payload = {
      invoice_type: form.invoice_type,
      order_id: form.invoice_type === "Đầu ra" ? form.order_id : null,
      customer_id: form.invoice_type === "Đầu ra" ? form.customer_id || null : null,
      branch_id: role === "branch_manager" ? branchId ?? form.branch_id : form.branch_id,
      supplier_name: form.invoice_type === "Đầu vào" ? form.supplier_name.trim() : null,
      amount: Number(form.amount || 0),
      invoice_date: form.invoice_date,
      content: form.content || null,
      note: form.note || null,
      linked_order_file_id: form.invoice_type === "Đầu ra" && form.linked_order_file_id ? form.linked_order_file_id : null,
    };

    const result = editing
      ? await supabase.from("invoices").update(payload).eq("id", editing.id).select("id, branch_id").single()
      : await supabase.from("invoices").insert(payload).select("id, branch_id").single();

    if (result.error || !result.data) {
      setSaving(false);
      setError(result.error?.message ?? "Không thể lưu hóa đơn");
      return;
    }

    try {
      if (form.invoice_type === "Đầu vào" && inputInvoiceFile) {
        await uploadInputInvoiceFile(result.data.id, result.data.branch_id ?? payload.branch_id, inputInvoiceFile);
      }
    } catch (uploadError) {
      setSaving(false);
      setError(uploadError instanceof Error ? uploadError.message : "Không thể tải file hóa đơn");
      await loadData();
      return;
    }

    setSaving(false);
    if (role !== "admin") {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createAdminNotification(supabase, {
        title: editing ? "Hóa đơn được cập nhật" : "Hóa đơn mới",
        message: `${editing ? "Đã cập nhật" : "Đã tạo"} hóa đơn ${form.invoice_type}`,
        notification_type: editing ? "invoice_updated" : "invoice_created",
        entity_type: "invoice",
        entity_id: result.data.id,
        branch_id: result.data.branch_id ?? payload.branch_id,
        actor_id: user?.id ?? null,
        actor_role: role,
      });
      await writeAuditLog(supabase, {
        action: editing ? "invoice_updated" : "invoice_created",
        entity_type: "invoice",
        entity_id: result.data.id,
        branch_id: result.data.branch_id ?? payload.branch_id,
        actor_id: user?.id ?? null,
        old_data: editing ? { ...editing } : null,
        new_data: payload,
      });
    }
    setMessage(editing ? "Đã cập nhật hóa đơn" : "Đã thêm hóa đơn");
    resetForm();
    await loadData();
  }

  async function deleteInvoice(invoice: InvoiceRow) {
    if (!canDelete) {
      setError("Bạn không có quyền xóa hóa đơn.");
      return;
    }

    const confirmed = window.confirm(`Bạn chắc chắn muốn xóa hóa đơn ${invoice.invoice_code}? Thao tác này không thể hoàn tác.`);
    if (!confirmed) return;

    setSaving(true);
    setError("");
    setMessage("");

    if (invoice.file_path) {
      const storageResult = await supabase.storage.from(FILE_BUCKET).remove([invoice.file_path]);
      if (storageResult.error) {
        setSaving(false);
        setError(`Không thể xóa file hóa đơn: ${storageResult.error.message}`);
        return;
      }
    }

    const result = await supabase.from("invoices").delete().eq("id", invoice.id);
    setSaving(false);

    if (result.error) {
      setError(`Không thể xóa hóa đơn: ${result.error.message}`);
      return;
    }

    setMessage("Đã xóa hóa đơn");
    if (editing?.id === invoice.id) resetForm();
    await loadData();
  }

  function fileLink(invoice: InvoiceRow) {
    if (invoice.linked_order_file?.file_path) return signedUrls[`order-file-${invoice.id}`] ?? invoice.linked_order_file.file_url ?? "";
    if (invoice.file_path) return signedUrls[`invoice-${invoice.id}`] ?? invoice.file_url ?? "";
    return "";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hóa đơn</h1>
          <p className="text-sm text-muted-foreground">Quản lý hóa đơn đầu vào và hóa đơn đầu ra theo đúng luồng kinh doanh.</p>
        </div>
        <div className="flex gap-2">
          <Button className="bg-slate-900" onClick={() => void loadData()}>
            <RefreshCcw className="h-4 w-4" />
            Tải lại
          </Button>
          <Button disabled={filteredInvoices.length === 0} onClick={() => void exportInvoices()}>
            <Download className="h-4 w-4" />
            Xuất Excel
          </Button>
        </div>
      </div>

      {canCreate || editing ? (
        <Card>
          <h2 className="mb-4 font-semibold">{editing ? `Sửa hóa đơn ${editing.invoice_code}` : "Thêm hóa đơn"}</h2>
          <form onSubmit={saveInvoice} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium">Loại hóa đơn</span>
              <Select value={form.invoice_type} onChange={(event) => updateForm("invoice_type", event.target.value)}>
                {INVOICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </Select>
            </label>

            {isInputInvoice ? (
              <>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Nhà cung cấp / Công ty bán</span>
                  <Input value={form.supplier_name} onChange={(event) => updateForm("supplier_name", event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Chi nhánh nhập</span>
                  <Select value={form.branch_id} disabled={role === "branch_manager"} onChange={(event) => updateForm("branch_id", event.target.value)}>
                    <option value="">Chọn chi nhánh nhập</option>
                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </Select>
                </label>
              </>
            ) : (
              <>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Đơn hàng liên quan</span>
                  <Select value={form.order_id} onChange={(event) => updateForm("order_id", event.target.value)}>
                    <option value="">Chọn đơn hàng liên quan</option>
                    {orderOptions.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.order_code} - {order.customers?.name ?? ""} - {order.customers?.phone ?? ""} - {formatMoney(order.total_amount)}
                      </option>
                    ))}
                  </Select>
                  <span className="block text-xs text-muted-foreground">Chọn đơn hàng mà hóa đơn đầu ra này thuộc về.</span>
                </label>
                <div className="rounded-md border bg-white p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Khách hàng</div>
                  <div className="mt-1 font-medium">{selectedOrder?.customers?.name ?? selectedCustomer?.name ?? "-"}</div>
                </div>
                <div className="rounded-md border bg-white p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Chi nhánh</div>
                  <div className="mt-1 font-medium">{selectedOrder?.branches?.name ?? selectedBranch?.name ?? "-"}</div>
                </div>
                {!form.order_id ? (
                  <label className="space-y-2">
                    <span className="text-sm font-medium">Khách hàng</span>
                    <Select value={form.customer_id} onChange={(event) => updateForm("customer_id", event.target.value)}>
                      <option value="">Chọn khách hàng</option>
                      {customerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_code} - {customer.name} - {customer.phone}</option>)}
                    </Select>
                  </label>
                ) : null}
              </>
            )}

            <label className="space-y-2">
              <span className="text-sm font-medium">Ngày hóa đơn</span>
              <Input type="date" value={form.invoice_date} onChange={(event) => updateForm("invoice_date", event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Số tiền</span>
              <Input type="number" min="1" value={form.amount} onChange={(event) => updateForm("amount", event.target.value)} />
            </label>

            {isInputInvoice ? (
              <label className="space-y-2">
                <span className="text-sm font-medium">File hóa đơn đầu vào</span>
                <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setInputInvoiceFile(event.target.files?.[0] ?? null)} />
              </label>
            ) : (
              <label className="space-y-2">
                <span className="text-sm font-medium">File/chứng từ từ đơn hàng</span>
                <Select value={form.linked_order_file_id} disabled={!form.order_id} onChange={(event) => updateForm("linked_order_file_id", event.target.value)}>
                  <option value="">Không liên kết file</option>
                  {relatedOrderFiles.map((file) => <option key={file.id} value={file.id}>{file.file_type} - {file.file_name ?? file.file_path}</option>)}
                </Select>
              </label>
            )}

            <label className="space-y-2 md:col-span-2 xl:col-span-3">
              <span className="text-sm font-medium">Nội dung hóa đơn</span>
              <Textarea value={form.content} onChange={(event) => updateForm("content", event.target.value)} />
            </label>
            <label className="space-y-2 md:col-span-2 xl:col-span-3">
              <span className="text-sm font-medium">Ghi chú</span>
              <Textarea value={form.note} onChange={(event) => updateForm("note", event.target.value)} />
            </label>
            <div className="flex items-end gap-2">
              <Button disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Đang lưu..." : editing ? "Cập nhật" : "Thêm hóa đơn"}
              </Button>
              {editing ? <Button type="button" className="bg-slate-700" onClick={resetForm}>Hủy</Button> : null}
            </div>
          </form>
          {message ? <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
        </Card>
      ) : null}

      <Card>
        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <div className="relative lg:col-span-3 xl:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã hóa đơn, mã đơn, khách hàng, nhà cung cấp" />
          </div>
          <Select value={invoiceTypeFilter} onChange={(event) => setInvoiceTypeFilter(event.target.value)}>
            <option value="">Tất cả loại hóa đơn</option>
            {INVOICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </Select>
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          <Select value={branchFilter} disabled={!canUseBranchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
            <option value="">Tất cả chi nhánh</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </Select>
        </div>
        {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3">Mã hóa đơn</th>
                <th>Loại</th>
                <th>Đơn hàng liên quan</th>
                <th>Khách hàng</th>
                <th>Nhà cung cấp / Công ty bán</th>
                <th>Chi nhánh</th>
                <th>Ngày hóa đơn</th>
                <th className="text-right">Số tiền</th>
                <th>File</th>
                <th className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={10}>Đang tải danh sách hóa đơn...</td></tr>
              ) : filteredInvoices.length === 0 ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={10}>Chưa có hóa đơn phù hợp</td></tr>
              ) : filteredInvoices.map((invoice) => {
                const link = fileLink(invoice);
                return (
                  <tr key={invoice.id} className="border-b">
                    <td className="py-3 font-medium">{invoice.invoice_code}</td>
                    <td><Badge>{invoice.invoice_type}</Badge></td>
                    <td>{invoice.invoice_type === "Đầu ra" ? invoice.orders?.order_code ?? "-" : "-"}</td>
                    <td>{invoice.invoice_type === "Đầu ra" ? invoice.orders?.customers?.name ?? invoice.customers?.name ?? "-" : "-"}</td>
                    <td>{invoice.invoice_type === "Đầu vào" ? invoice.supplier_name ?? "-" : "-"}</td>
                    <td>{invoice.orders?.branches?.name ?? invoice.branches?.name ?? "-"}</td>
                    <td>{formatDate(invoice.invoice_date)}</td>
                    <td className="text-right">{formatMoney(invoice.amount)}</td>
                    <td>
                      {link ? (
                        <a className="inline-flex items-center gap-1 text-primary hover:underline" href={link} target="_blank" rel="noreferrer">
                          Xem file <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : "-"}
                    </td>
                    <td className="text-right">
                      {canEdit ? <Button className="h-8 px-3" onClick={() => startEdit(invoice)}>Sửa</Button> : null}
                      {canDelete ? (
                        <Button type="button" className="ml-2 h-8 bg-red-600 px-3 hover:bg-red-700" disabled={saving} onClick={() => void deleteInvoice(invoice)}>
                          <Trash2 className="h-3.5 w-3.5" />
                          Xóa
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
