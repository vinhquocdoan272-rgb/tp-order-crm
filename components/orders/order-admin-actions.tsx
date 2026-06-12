"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { UserRole } from "@/lib/types/database";
import { canDeleteOrder } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export function DeleteOrderButton({
  orderId,
  role,
  onDeleted,
}: {
  orderId: string;
  role: UserRole;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  if (!canDeleteOrder(role)) return null;

  async function deleteOrder() {
    if (!canDeleteOrder(role)) {
      setMessage("Bạn không có quyền xóa đơn hàng.");
      return;
    }

    setDeleting(true);
    setMessage("");
    const { error } = await supabase.from("orders").delete().eq("id", orderId);
    setDeleting(false);

    if (error) {
      setMessage("Không thể xóa đơn hàng");
      return;
    }

    setOpen(false);
    setMessage("Đã xóa đơn hàng");
    if (onDeleted) onDeleted();
    else router.push("/orders");
    router.refresh();
  }

  return (
    <>
      <Button type="button" className="h-8 bg-red-600 px-3 hover:bg-red-700" onClick={() => setOpen(true)}>
        Xóa
      </Button>
      {message ? <span className="ml-2 text-xs text-muted-foreground">{message}</span> : null}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Xóa đơn hàng</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Bạn chắc chắn muốn xóa đơn này? Thao tác này sẽ xóa đơn và có thể ảnh hưởng đến chi phí, chứng từ, nộp tiền và hóa đơn liên quan.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" className="bg-slate-700" onClick={() => setOpen(false)} disabled={deleting}>
                Hủy
              </Button>
              <Button type="button" className="bg-red-600 hover:bg-red-700" onClick={() => void deleteOrder()} disabled={deleting}>
                {deleting ? "Đang xóa..." : "Xóa đơn"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function CancelOrderButton({
  orderId,
  role,
  onCancelled,
}: {
  orderId: string;
  role: UserRole;
  onCancelled?: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  if (role !== "branch_manager") return null;

  async function cancelOrder() {
    setSaving(true);
    setMessage("");
    const { error } = await supabase.from("orders").update({ status: "Hủy" }).eq("id", orderId);
    setSaving(false);

    if (error) {
      setMessage("Không thể hủy đơn hàng");
      return;
    }

    setMessage("Đã hủy đơn hàng");
    if (onCancelled) onCancelled();
    router.refresh();
  }

  return (
    <>
      <Button type="button" className="h-8 bg-amber-600 px-3 hover:bg-amber-700" onClick={() => void cancelOrder()} disabled={saving}>
        {saving ? "Đang hủy..." : "Hủy đơn"}
      </Button>
      {message ? <span className="ml-2 text-xs text-muted-foreground">{message}</span> : null}
    </>
  );
}
