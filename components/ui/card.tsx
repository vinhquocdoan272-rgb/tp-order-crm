import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/format";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("max-w-full rounded-lg border bg-card p-4 shadow-sm sm:p-5", className)} {...props} />;
}
