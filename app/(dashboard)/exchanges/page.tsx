import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { ExchangesBrowser } from "@/components/exchanges/exchanges-browser";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { listExchanges } from "@/lib/returns/queries";
import { normalizePage, normalizePageSize } from "@/lib/catalog/config";
import { DATE_PRESETS, isDatePreset, resolveDateRange } from "@/lib/sales/date-range";
import type { ReturnStatus } from "@/types/returns";

export const metadata: Metadata = { title: "الاستبدالات" };

export default async function ExchangesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    range?: string;
    from?: string;
    to?: string;
    status?: string;
    page?: string;
    perPage?: string;
  }>;
}) {
  const { profile } = await requirePermission("VIEW_EXCHANGES");
  const params = await searchParams;

  const preset = isDatePreset(params.range) ? params.range : "month";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });

  const status = (
    ["DRAFT", "COMPLETED", "CANCELLED"].includes(params.status ?? "")
      ? params.status
      : "ALL"
  ) as ReturnStatus | "ALL";

  const data = await listExchanges({
    search: params.q,
    status,
    from: range.from,
    to: range.to,
    page: normalizePage(params.page),
    perPage: normalizePageSize(params.perPage),
  });

  const presetLabel = DATE_PRESETS.find((o) => o.value === preset)?.label ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="الاستبدالات"
        description="استبدال قطعة بأخرى مع تسوية الفرق."
        actions={
          <Badge
            variant="outline"
            className="bg-accent text-accent-foreground border-accent-foreground/15"
          >
            {presetLabel}
          </Badge>
        }
      />

      <ExchangesBrowser
        data={data}
        canCreate={hasPermission(profile, "CREATE_EXCHANGES")}
      />
    </div>
  );
}
