import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/types/database";

type NotificationInput = {
  title: string;
  message: string;
  notification_type: string;
  entity_type: string;
  entity_id?: string | null;
  branch_id?: string | null;
  actor_id?: string | null;
  actor_role?: UserRole | string | null;
  metadata?: Record<string, unknown> | null;
};

type AuditInput = {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  branch_id?: string | null;
  actor_id?: string | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
};

export async function createAdminNotification(supabase: SupabaseClient, input: NotificationInput) {
  await supabase.from("admin_notifications").insert({
    title: input.title,
    message: input.message,
    notification_type: input.notification_type,
    entity_type: input.entity_type,
    entity_id: input.entity_id ?? null,
    branch_id: input.branch_id ?? null,
    actor_id: input.actor_id ?? null,
    actor_role: input.actor_role ?? null,
    metadata: input.metadata ?? null,
  });
}

export async function writeAuditLog(supabase: SupabaseClient, input: AuditInput) {
  await supabase.from("audit_logs").insert({
    actor_id: input.actor_id ?? null,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id ?? null,
    branch_id: input.branch_id ?? null,
    old_data: input.old_data ?? null,
    new_data: input.new_data ?? null,
  });
}
