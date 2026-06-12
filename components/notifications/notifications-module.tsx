"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCheck, RefreshCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { formatDate } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  entity_type: string;
  entity_id: string | null;
  branch_id: string | null;
  actor_id: string | null;
  actor_role: string | null;
  is_read: boolean;
  created_at: string;
  branches?: { name: string | null } | null;
  actor?: { full_name: string | null } | null;
};

export function NotificationsModule() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadRows() {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("admin_notifications")
      .select("*, branches(name), actor:profiles!admin_notifications_actor_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    setLoading(false);

    if (queryError) {
      setError(queryError.message);
      return;
    }
    setRows((data ?? []) as unknown as NotificationRow[]);
  }

  useEffect(() => {
    void loadRows();
  }, []);

  async function markRead(id: string) {
    await supabase.from("admin_notifications").update({ is_read: true }).eq("id", id);
    await loadRows();
  }

  async function markAllRead() {
    await supabase.from("admin_notifications").update({ is_read: true }).eq("is_read", false);
    await loadRows();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Thông báo</h1>
          <p className="text-sm text-muted-foreground">Theo dõi các thay đổi quan trọng từ nhân viên và quản lý chi nhánh.</p>
        </div>
        <div className="flex gap-2">
          <Button className="bg-slate-900" onClick={() => void loadRows()}>
            <RefreshCcw className="h-4 w-4" />
            Tải lại
          </Button>
          <Button disabled={rows.every((row) => row.is_read)} onClick={() => void markAllRead()}>
            <CheckCheck className="h-4 w-4" />
            Đánh dấu tất cả đã đọc
          </Button>
        </div>
      </div>

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3">Thời gian</th>
                <th>Loại</th>
                <th>Nội dung</th>
                <th>Người thực hiện</th>
                <th>Chi nhánh</th>
                <th>Trạng thái</th>
                <th className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={7}>Đang tải thông báo...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={7}>Chưa có thông báo</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-3">{formatDate(row.created_at)}</td>
                  <td>{row.notification_type}</td>
                  <td><div className="font-medium">{row.title}</div><div className="text-xs text-muted-foreground">{row.message}</div></td>
                  <td>{row.actor?.full_name ?? "-"}</td>
                  <td>{row.branches?.name ?? "-"}</td>
                  <td><Badge>{row.is_read ? "Đã đọc" : "Thông báo mới"}</Badge></td>
                  <td className="text-right">
                    {!row.is_read ? <Button className="h-8 px-3" onClick={() => void markRead(row.id)}>Đánh dấu đã đọc</Button> : null}
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
