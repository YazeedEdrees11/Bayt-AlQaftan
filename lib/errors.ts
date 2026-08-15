import "server-only";

/**
 * Centralised error handling (§45–§49).
 *
 * One shape for every failure: a code the code can branch on, an Arabic
 * sentence a shopkeeper can act on, and a request id that ties the two to a
 * line in the server log. The internal detail — the SQL message, the constraint
 * name, the stack — stays on the server. §47 is unambiguous about that, and it
 * is not only a security rule: a salesperson shown
 * `duplicate key value violates unique constraint "sales_sale_number_key"` has
 * learned nothing and been alarmed anyway.
 *
 * The request id is what makes "تعذر حفظ العملية" actionable. The user reads a
 * short code back over the phone; the log has the rest.
 */

export type ErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "INSUFFICIENT_FUNDS"
  | "RULE_BLOCKED"
  | "DUPLICATE"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type AppError = {
  code: ErrorCode;
  /** Shown to the user. Arabic, specific where possible (§46). */
  message: string;
  requestId: string;
};

/** Short, readable, and unique enough to find one line in a day's logs. */
export function newRequestId(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const salt = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${stamp}-${salt}`;
}

const MESSAGES: Record<ErrorCode, string> = {
  FORBIDDEN: "ليس لديك صلاحية لتنفيذ هذه العملية.",
  NOT_FOUND: "السجل المطلوب غير موجود.",
  VALIDATION: "تحقق من البيانات المدخلة.",
  CONFLICT: "تعذر تنفيذ العملية بسبب تعارض في البيانات.",
  INSUFFICIENT_STOCK: "لا يوجد مخزون كافٍ.",
  INSUFFICIENT_FUNDS: "لا يوجد رصيد كافٍ في الحساب.",
  RULE_BLOCKED: "هذه العملية ممنوعة حسب إعدادات النظام.",
  DUPLICATE: "هذه العملية مسجّلة بالفعل.",
  UNAVAILABLE: "الخدمة غير متاحة حالياً. يرجى المحاولة مرة أخرى.",
  UNKNOWN: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
};

/** Maps a database error onto a code, by the errcodes the RPCs actually raise. */
function classify(raw: string): ErrorCode {
  const message = raw.toLowerCase();
  if (message.includes("forbidden") || message.includes("42501")) return "FORBIDDEN";
  if (message.includes("insufficient_stock")) return "INSUFFICIENT_STOCK";
  if (message.includes("insufficient_funds")) return "INSUFFICIENT_FUNDS";
  if (message.includes("not_found")) return "NOT_FOUND";
  if (message.includes("duplicate_request")) return "DUPLICATE";
  if (message.includes("duplicate") || message.includes("unique")) return "CONFLICT";
  if (
    message.includes("_disabled") ||
    message.includes("_required") ||
    message.includes("_expired") ||
    message.includes("exceeds_limit") ||
    message.includes("not_allowed")
  ) {
    return "RULE_BLOCKED";
  }
  if (message.includes("invalid") || message.includes("22023")) return "VALIDATION";
  if (message.includes("timeout") || message.includes("connection")) return "UNAVAILABLE";
  return "UNKNOWN";
}

/**
 * Logs the real error and returns the safe one.
 *
 * `operation` and `userId` go to the log so a report can be traced from the
 * user's complaint to the line that failed (§48, §49). The payload never does:
 * it carries customer names, amounts and sometimes a receipt path.
 */
export function handleError(
  error: unknown,
  context: { operation: string; userId?: string | null; fallback?: string },
): AppError {
  const requestId = newRequestId();
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);

  const code = classify(raw);

  console.error(
    JSON.stringify({
      level: "ERROR",
      timestamp: new Date().toISOString(),
      requestId,
      operation: context.operation,
      userId: context.userId ?? undefined,
      code,
      // The raw text is for whoever reads the log, and goes no further.
      detail: raw.slice(0, 500),
    }),
  );

  // Best effort, and deliberately not awaited by the caller: an error while
  // recording an error must not replace the original one. If the write fails
  // the console line above is still there.
  void recordEvent({
    severity: "ERROR",
    category: categoryFor(code),
    operation: context.operation,
    message: raw.slice(0, 500),
    code,
    requestId,
  });

  return {
    code,
    message: context.fallback && code === "UNKNOWN" ? context.fallback : MESSAGES[code],
    requestId,
  };
}

function categoryFor(code: ErrorCode): string {
  if (code === "FORBIDDEN") return "AUTH";
  if (code === "UNAVAILABLE") return "DATABASE";
  return "APPLICATION";
}

/**
 * Writes an event to `system_events`.
 *
 * Separate from `handleError` so the application can record notable things that
 * are not failures — a job that ran, a backup that was verified.
 */
export async function recordEvent(event: {
  severity: "DEBUG" | "INFO" | "WARN" | "ERROR";
  category: string;
  operation: string;
  message: string;
  code?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase.rpc("record_system_event", {
      p_severity: event.severity,
      p_category: event.category,
      p_operation: event.operation,
      p_message: event.message,
      p_code: event.code ?? undefined,
      p_request_id: event.requestId ?? undefined,
      p_metadata: (event.metadata ?? undefined) as never,
    });
  } catch (error) {
    console.error("[errors] could not record event:", error);
  }
}

/** The user-facing sentence, with the id appended so it can be quoted. */
export function userMessage(error: AppError): string {
  return `${error.message} (${error.requestId})`;
}
