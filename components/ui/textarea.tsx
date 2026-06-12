import { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/format";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("min-h-24 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring", className)} {...props} />;
}
