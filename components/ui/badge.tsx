import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/format";
import { STATUS_TONE } from "@/lib/constants/app";

export function Badge({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  const value = typeof children === "string" ? children : "";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", STATUS_TONE[value] ?? "bg-muted text-muted-foreground", className)} {...props}>{children}</span>;
}
