import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/format";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border bg-card p-5 shadow-sm", className)} {...props} />;
}
