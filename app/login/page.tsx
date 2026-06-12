import { Suspense } from "react";
import { LoginForm } from "@/app/login/login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Đang tải...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
