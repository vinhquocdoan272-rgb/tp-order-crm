"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { getRoleHomePath, isValidRole, UNASSIGNED_ACCOUNT_MESSAGE } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("error") !== "unassigned") return;

    const supabase = createClient();
    supabase.auth.signOut().finally(() => {
      setError(UNASSIGNED_ACCOUNT_MESSAGE);
    });
  }, [searchParams]);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: String(formData.get("email")),
      password: String(formData.get("password")),
    });

    if (signInError || !data.user) {
      setLoading(false);
      setError("Email hoặc mật khẩu không đúng");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile?.is_active || !isValidRole(profile.role)) {
      await supabase.auth.signOut();
      setLoading(false);
      setError(UNASSIGNED_ACCOUNT_MESSAGE);
      return;
    }

    setLoading(false);
    router.replace(getRoleHomePath(profile.role));
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Đăng nhập</h1>
        <p className="mt-1 text-sm text-muted-foreground">TP Order CRM - Tin Học Tấn Phát</p>
      </div>
      <form action={handleSubmit} className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Email</span>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" name="email" type="email" required placeholder="admin@tanphat.vn" />
          </div>
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Mật khẩu</span>
          <div className="relative">
            <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" name="password" type="password" required placeholder="Nhập mật khẩu" />
          </div>
        </label>
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <Button className="w-full" disabled={loading}>{loading ? "Đang đăng nhập..." : "Đăng nhập"}</Button>
      </form>
    </Card>
  );
}
