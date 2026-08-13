import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { PurchasesBrowser } from "@/components/purchases/purchases-browser";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { listPurchases } from "@/lib/purchasing/queries";
import { listActiveSuppliers } from "@/lib/catalog/queries";
import { normalizePage, normalizePageSize } from "@/lib/catalog/config";
import type { PaymentStatus, PurchaseStatus } from "@/types/purchasing";

export const metadata: Metadata = { title: "المشتريات" };

function parseAmount(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return Number.isNaN(new Date(value).getTime()) ? undefined : value;
}

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    supplier?: string;
    paymentStatus?: string;
    status?: string;
    from?: string;
    to?: string;
    minAmount?: string;
    maxAmount?: string;
    method?: string;
    page?: string;
    perPage?: string;
  }>;
}) {
  const { profile } = await requirePermission("VIEW_PURCHASES");
  const params = await searchParams;

  const paymentStatus = (
    ["UNPAID", "PARTIALLY_PAID", "PAID"].includes(params.paymentStatus ?? "")
      ? params.paymentStatus
      : "ALL"
  ) as PaymentStatus | "ALL";

  const status = (
    ["DRAFT", "COMPLETED", "CANCELLED"].includes(params.status ?? "")
      ? params.status
      : "ALL"
  ) as PurchaseStatus | "ALL";

  const paymentMethod = (
    ["CASH", "BANK_TRANSFER"].includes(params.method ?? "")
      ? params.method
      : "ALL"
  ) as "CASH" | "BANK_TRANSFER" | "ALL";

  const [data, suppliers] = await Promise.all([
    listPurchases({
      search: params.q,
      supplierId: params.supplier,
      paymentStatus,
      status,
      dateFrom: parseDate(params.from),
      dateTo: parseDate(params.to),
      minAmount: parseAmount(params.minAmount),
      maxAmount: parseAmount(params.maxAmount),
      paymentMethod,
      page: normalizePage(params.page),
      perPage: normalizePageSize(params.perPage),
    }),
    listActiveSuppliers(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="المشتريات"
        description="تسجيل ومتابعة البضاعة التي تصل إلى بيت القفطان."
      />

      <PurchasesBrowser
        data={data}
        suppliers={suppliers}
        canCreate={hasPermission(profile, "CREATE_PURCHASES")}
      />
    </div>
  );
}
