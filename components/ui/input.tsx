import { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/format";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring", className)} {...props} />;
}
