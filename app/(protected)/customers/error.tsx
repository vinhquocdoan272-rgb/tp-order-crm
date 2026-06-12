"use client";

import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function CustomersError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="flex items-start gap-3 border-red-200 bg-red-50 text-red-800">
      <AlertCircle className="mt-0.5 h-5 w-5" />
      <div className="space-y-3">
        <div>
          <h1 className="font-semibold">Không thể tải khách hàng</h1>
          <p className="mt-1 text-sm">{error.message || "Đã xảy ra lỗi khi tải dữ liệu."}</p>
        </div>
        <Button className="bg-red-700" onClick={reset}>
          <RefreshCcw className="h-4 w-4" />
          Thử lại
        </Button>
      </div>
    </Card>
  );
}
