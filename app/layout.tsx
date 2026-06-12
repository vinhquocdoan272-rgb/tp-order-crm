import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TP Order CRM",
  description: "Quản lý đơn hàng dịch vụ Tin Học Tấn Phát",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
