import { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils/format";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring", className)} {...props}>
      {children}
    </select>
  );
}
