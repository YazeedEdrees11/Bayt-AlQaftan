import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness (§99, §100).
 *
 * Deliberately unauthenticated, because a monitor that needs a session cannot
 * tell you the service is down — signing in is the first thing that stops
 * working. That constrains what it may say: a version, a status per dependency,
 * a timestamp. No hostnames, no connection strings, no error text from the
 * database, nothing that describes the infrastructure to someone probing it.
 *
 * `GET /api/health`        — is the application answering at all
 * `GET /api/health?ready=1` — and are its dependencies actually usable
 *
 * The distinction matters during a deploy: liveness says the process is up,
 * readiness says it can serve a customer. A load balancer wants the first; a
 * person deciding whether to open the shop wants the second.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const wantsReadiness = new URL(request.url).searchParams.has("ready");

  const body: Record<string, unknown> = {
    status: "ok",
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  };

  if (!wantsReadiness) {
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const checks: Record<string, "ok" | "down"> = {};

  try {
    const supabase = await createClient();

    // The smallest real query: one row from a table that always has one.
    const { error: dbError } = await supabase
      .from("app_config")
      .select("app_version")
      .limit(1);
    checks.database = dbError ? "down" : "ok";
    if (dbError) console.error("[health] database:", dbError.message);

    const { error: storageError } = await supabase.storage
      .from("store-assets")
      .list("", { limit: 1 });
    checks.storage = storageError ? "down" : "ok";
    if (storageError) console.error("[health] storage:", storageError.message);
  } catch (error) {
    console.error("[health] probe threw:", error);
    checks.database = checks.database ?? "down";
    checks.storage = checks.storage ?? "down";
  }

  const ready = Object.values(checks).every((state) => state === "ok");

  return NextResponse.json(
    {
      ...body,
      status: ready ? "ready" : "degraded",
      checks,
      durationMs: Date.now() - startedAt,
    },
    {
      // 503 so an orchestrator can act on it without parsing the body.
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
