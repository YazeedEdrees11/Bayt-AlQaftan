import "server-only";

import {
  createAdminClient,
  createClient,
  type TypedSupabaseClient,
} from "@/lib/supabase/server";
import type { AuditAction } from "@/types/auth";

/**
 * Audit trail helper shared by every module.
 *
 * Writing an audit entry must never break the operation it is recording, so
 * failures are logged to the server console and swallowed.
 */

export interface LogActionInput {
  /** Who performed the action. `null` for system-initiated events. */
  userId?: string | null;
  /** e.g. LOGIN, CREATE_USER, CHANGE_ROLE — see `AuditAction`. */
  action: AuditAction;
  /** The kind of record touched, e.g. "user", "product", "sale". */
  entityType: string;
  /** Primary key of the touched record, when there is one. */
  entityId?: string | null;
  /** Anything worth keeping for later inspection. */
  metadata?: Record<string, unknown> | null;
  /**
   * Use the service-role client. Required when the acting user cannot insert
   * the row under RLS — for instance when recording an action performed on
   * behalf of somebody else.
   */
  useAdminClient?: boolean;
  /**
   * An existing client to reuse. Handy right after sign-in, where the caller
   * already holds a client carrying the fresh session.
   */
  client?: TypedSupabaseClient;
}

export async function logAction({
  userId = null,
  action,
  entityType,
  entityId = null,
  metadata = null,
  useAdminClient = false,
  client,
}: LogActionInput): Promise<void> {
  try {
    const supabase =
      client ?? (useAdminClient ? createAdminClient() : await createClient());

    const { error } = await supabase.from("audit_logs").insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: metadata as never,
    });

    if (error) {
      console.error("[audit] failed to write audit log:", error.message);
    }
  } catch (error) {
    console.error("[audit] failed to write audit log:", error);
  }
}
