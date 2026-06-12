"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export function NotificationBell() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);

  async function loadNotifications() {
    const { data } = await supabase
      .from("admin_notifications")
      .select("id, title, message, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    setRows((data ?? []) as NotificationRow[]);
  }

  useEffect(() => {
    void loadNotifications();
  }, []);

  async function markRead(id: string) {
    await supabase.from("admin_notifications").update({ is_read: true }).eq("id", id);
    await loadNotifications();
  }

  const unreadCount = rows.filter((row) => !row.is_read).length;

  return (
    <div className="relative">
      <Button type="button" className="relative h-9 bg-white px-3 text-slate-700 ring-1 ring-slate-200 hover:bg-muted" onClick={() => setOpen((current) => !current)}>
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{unreadCount}</span>
        ) : null}
      </Button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-md border bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-semibold">Thông báo mới</div>
            <Link className="text-xs text-primary hover:underline" href="/notifications">Xem tất cả</Link>
          </div>
          <div className="max-h-80 space-y-2 overflow-auto">
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Chưa có thông báo</p>
            ) : rows.map((row) => (
              <div key={row.id} className="rounded-md border p-2 text-sm">
                <div className="font-medium">{row.title}</div>
                <p className="mt-1 text-xs text-muted-foreground">{row.message}</p>
                {!row.is_read ? (
                  <button className="mt-2 text-xs text-primary hover:underline" onClick={() => void markRead(row.id)}>
                    Đánh dấu đã đọc
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
