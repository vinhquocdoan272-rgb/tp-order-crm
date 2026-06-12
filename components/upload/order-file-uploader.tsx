"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Trash2, Upload } from "lucide-react";
import { FILE_BUCKET, FILE_TYPES } from "@/lib/constants/app";
import { createAdminNotification } from "@/lib/notifications/admin-notifications";
import { sanitizeFileName } from "@/lib/storage/files";
import { validateUploadFile } from "@/lib/validations/schemas";
import { createClient } from "@/lib/supabase/browser";
import type { OrderFile, UserRole } from "@/lib/types/database";
import { formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type FileRow = OrderFile & {
  profiles?: { full_name: string | null } | null;
};

export function OrderFileUploader({ orderId, branchId, role }: { orderId: string; branchId: string; role?: UserRole }) {
  const supabase = useMemo(() => createClient(), []);
  const canDelete = role === "admin" || role === "branch_manager";
  const [files, setFiles] = useState<FileRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);

  async function loadFiles() {
    setLoadingFiles(true);
    const { data, error } = await supabase
      .from("order_files")
      .select("*, profiles:uploaded_by(full_name)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) {
      setLoadingFiles(false);
      setMessage(error.message);
      return;
    }

    const rows = (data ?? []) as unknown as FileRow[];
    setFiles(rows);

    const urls: Record<string, string> = {};
    await Promise.all(rows.map(async (file) => {
      const { data: signed } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(file.file_path, 60 * 10);
      urls[file.id] = signed?.signedUrl ?? file.file_url;
    }));
    setSignedUrls(urls);
    setLoadingFiles(false);
  }

  useEffect(() => {
    void loadFiles();
  }, []);

  async function upload(formData: FormData) {
    setMessage("");
    const file = formData.get("file");
    const fileType = String(formData.get("file_type") ?? "Khác");

    if (!(file instanceof File) || file.size === 0) {
      setMessage("Vui lòng chọn file");
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

    const fileId = crypto.randomUUID();
    const storageFileName = `${Date.now()}-${sanitizeFileName(file.name)}`;
    const filePath = `branch/${branchId}/orders/${orderId}/files/${fileId}/${storageFileName}`;
    const uploadResult = await supabase.storage.from(FILE_BUCKET).upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

    if (uploadResult.error) {
      setLoading(false);
      setMessage(`Không thể tải file: ${uploadResult.error.message}`);
      return;
    }

    const { data } = supabase.storage.from(FILE_BUCKET).getPublicUrl(filePath);
    const { error } = await supabase.from("order_files").insert({
      id: fileId,
      order_id: orderId,
      file_type: fileType,
      file_name: file.name,
      file_url: data.publicUrl,
      file_path: filePath,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: user.id,
    });

    setLoading(false);

    if (error) {
      await supabase.storage.from(FILE_BUCKET).remove([filePath]);
      setMessage(`Không thể tải file: ${error.message}`);
      return;
    }

    setMessage("Tải file thành công");
    if (role !== "admin") {
      await createAdminNotification(supabase, {
        title: "File đơn hàng mới",
        message: `Đã tải file ${file.name}`,
        notification_type: "file_uploaded",
        entity_type: "order_file",
        entity_id: fileId,
        branch_id: branchId,
        actor_id: user.id,
        actor_role: role ?? null,
      });
    }
    await loadFiles();
  }

  async function deleteFile(file: FileRow) {
    if (!canDelete) return;
    if (!confirm("Bạn chắc chắn muốn xóa file này?")) return;

    const { error } = await supabase.from("order_files").delete().eq("id", file.id);
    if (error) {
      setMessage(error.message);
      return;
    }

    await supabase.storage.from(FILE_BUCKET).remove([file.file_path]);
    if (role !== "admin") {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createAdminNotification(supabase, {
        title: "File đơn hàng bị xóa",
        message: `Đã xóa file ${file.file_name ?? file.file_path}`,
        notification_type: "file_deleted",
        entity_type: "order_file",
        entity_id: file.id,
        branch_id: branchId,
        actor_id: user?.id ?? null,
        actor_role: role ?? null,
      });
    }
    await loadFiles();
  }

  return (
    <div className="space-y-4">
      <form action={upload} className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
        <Select name="file_type" defaultValue="Khác">
          {FILE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </Select>
        <Input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
        <Button disabled={loading}>
          <Upload className="h-4 w-4" />
          {loading ? "Đang tải..." : "Tải hóa đơn/chứng từ"}
        </Button>
        {message ? <p className="text-sm text-muted-foreground md:col-span-3">{message}</p> : null}
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-3">Loại file</th>
              <th>Tên file</th>
              <th>Ngày tải lên</th>
              <th>Người tải lên</th>
              <th className="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loadingFiles ? (
              <tr><td className="py-8 text-center text-muted-foreground" colSpan={5}>Đang tải danh sách file...</td></tr>
            ) : files.length === 0 ? (
              <tr><td className="py-8 text-center text-muted-foreground" colSpan={5}>Chưa có file đính kèm</td></tr>
            ) : files.map((file) => (
              <tr key={file.id} className="border-b">
                <td className="py-3">{file.file_type}</td>
                <td>{file.file_name ?? file.file_path}</td>
                <td>{formatDate(file.created_at)}</td>
                <td>{file.profiles?.full_name ?? "-"}</td>
                <td className="py-3 text-right">
                  <a className="mr-2 inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-medium text-white" href={signedUrls[file.id] ?? file.file_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Mở file
                  </a>
                  {canDelete ? (
                    <Button className="h-8 bg-destructive px-3" onClick={() => void deleteFile(file)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Xóa file
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
