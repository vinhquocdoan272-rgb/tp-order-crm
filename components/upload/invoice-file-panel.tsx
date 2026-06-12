"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Upload } from "lucide-react";
import { FILE_BUCKET } from "@/lib/constants/app";
import { formatFileSize, sanitizeFileName } from "@/lib/storage/files";
import { validateUploadFile } from "@/lib/validations/schemas";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type InvoiceOption = {
  id: string;
  invoice_code: string;
  branch_id: string | null;
  file_name: string | null;
  file_path: string | null;
  file_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
};

export function InvoiceFilePanel() {
  const supabase = useMemo(() => createClient(), []);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadInvoices() {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_code, branch_id, file_name, file_path, file_url, mime_type, size_bytes")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setMessage(`Không thể tải danh sách hóa đơn: ${error.message}`);
      return;
    }

    const rows = (data ?? []) as InvoiceOption[];
    setInvoices(rows);

    const urlEntries = await Promise.all(
      rows
        .filter((invoice) => invoice.file_path)
        .map(async (invoice) => {
          const { data: signedData } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(invoice.file_path!, 60 * 10);
          return [invoice.id, signedData?.signedUrl ?? invoice.file_url ?? ""] as const;
        }),
    );
    setSignedUrls(Object.fromEntries(urlEntries));
  }

  useEffect(() => {
    void loadInvoices();
  }, []);

  async function upload(formData: FormData) {
    setMessage("");
    const invoiceId = String(formData.get("invoice_id") ?? "");
    const invoice = invoices.find((item) => item.id === invoiceId);
    const file = formData.get("file");

    if (!invoice || !invoice.branch_id) {
      setMessage("Vui lòng chọn hóa đơn hợp lệ");
      return;
    }

    if (!(file instanceof File) || file.size === 0) {
      setMessage("Vui lòng chọn file hóa đơn");
      return;
    }

    const validation = validateUploadFile(file);
    if (validation) {
      setMessage(validation);
      return;
    }

    setLoading(true);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setLoading(false);
      setMessage("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
      return;
    }

    const storageFileName = `${Date.now()}-${sanitizeFileName(file.name)}`;
    const filePath = `branch/${invoice.branch_id}/invoices/${invoice.id}/${storageFileName}`;
    const uploadResult = await supabase.storage.from(FILE_BUCKET).upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

    if (uploadResult.error) {
      setLoading(false);
      setMessage(`Tải file thất bại: ${uploadResult.error.message}`);
      return;
    }

    const { data } = supabase.storage.from(FILE_BUCKET).getPublicUrl(filePath);
    const { error } = await supabase
      .from("invoices")
      .update({
        file_url: data.publicUrl,
        file_path: filePath,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: user.id,
      })
      .eq("id", invoice.id);

    setLoading(false);

    if (error) {
      await supabase.storage.from(FILE_BUCKET).remove([filePath]);
      setMessage(`Lưu thông tin file hóa đơn thất bại: ${error.message}`);
      return;
    }

    setMessage("Đã cập nhật file hóa đơn");
    await loadInvoices();
  }

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Upload file hóa đơn</h2>
      <form action={upload} className="grid gap-3 md:grid-cols-[280px_1fr_auto]">
        <Select name="invoice_id" required>
          <option value="">Chọn hóa đơn</option>
          {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_code}</option>)}
        </Select>
        <Input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
        <Button disabled={loading}>
          <Upload className="h-4 w-4" />
          {loading ? "Đang tải..." : "Tải file"}
        </Button>
        {message ? <p className="text-sm text-muted-foreground md:col-span-3">{message}</p> : null}
      </form>

      <div className="mt-4 space-y-2">
        {invoices.filter((invoice) => invoice.file_path).map((invoice) => (
          <a key={invoice.id} className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted" href={signedUrls[invoice.id] || invoice.file_url || "#"} target="_blank" rel="noreferrer">
            <span>
              <span className="font-medium">{invoice.invoice_code}</span>
              <span className="ml-2 text-muted-foreground">{invoice.file_name ?? invoice.file_path}</span>
              <span className="ml-2 text-muted-foreground">{formatFileSize(invoice.size_bytes)}</span>
            </span>
            <ExternalLink className="h-4 w-4" />
          </a>
        ))}
      </div>
    </Card>
  );
}
