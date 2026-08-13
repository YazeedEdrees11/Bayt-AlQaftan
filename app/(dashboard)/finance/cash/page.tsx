import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { CashDatePicker } from "@/components/finance/cash-date-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requirePermission } from "@/lib/auth/require-auth";
import { getDailyCashSummary } from "@/lib/finance/queries";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "حركة الصندوق" };

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requirePermission("VIEW_FINANCE");
  const params = await searchParams;

  const date =
    params.date && !Number.isNaN(Date.parse(params.date))
      ? params.date
      : new Date().toISOString().slice(0, 10);

  const cash = await getDailyCashSummary(date);

  const inflows = [
    { label: "مقبوضات المبيعات", value: cash.sale_payments },
    { label: "دفعات العملاء", value: cash.customer_payments },
    { label: "تحويلات واردة", value: cash.transfers_in, muted: true },
    { label: "وارد آخر", value: cash.other_in, muted: true },
  ];
  const outflows = [
    { label: "دفعات المشتريات", value: cash.purchase_payments },
    { label: "دفعات الموردين", value: cash.supplier_payments },
    { label: "المصاريف", value: cash.expenses },
    { label: "المبالغ المستردة", value: cash.refunds },
    { label: "تحويلات صادرة", value: cash.transfers_out, muted: true },
    { label: "صادر آخر", value: cash.other_out, muted: true },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="حركة الصندوق"
        description={`الصندوق النقدي ليوم ${formatDate(date)} — من الرصيد الافتتاحي إلى الختامي.`}
        actions={
          <>
            <CashDatePicker date={date} />
            <Button asChild variant="outline">
              <Link href="/finance">
                <ChevronRight className="size-4" />
                المالية
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>تفصيل اليوم</CardTitle>
            <CardDescription>
              يشمل كل الحسابات النقدية. التحويلات والتعديلات تظهر لأنها تغيّر
              رصيد الصندوق فعلاً، حتى لو لم تكن دخلاً ولا مصروفاً — وبنود
              «وارد آخر» و«صادر آخر» تضمن أن يقفل الكشف دائماً.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border px-4 py-3">
              <span className="font-medium">الرصيد الافتتاحي</span>
              <span className="text-lg font-semibold tabular-nums">
                {formatMoney(cash.opening_cash)}
              </span>
            </div>

            <div className="space-y-2">
              <h3 className="text-success text-sm font-medium">الداخل</h3>
              {inflows.map((row) => (
                <Row key={row.label} label={row.label} value={row.value} tone="positive" muted={row.muted} />
              ))}
            </div>

            <Separator />

            <div className="space-y-2">
              <h3 className="text-destructive text-sm font-medium">الخارج</h3>
              {outflows.map((row) => (
                <Row key={row.label} label={row.label} value={row.value} tone="negative" muted={row.muted} />
              ))}
            </div>

            <Separator />

            <div className="bg-muted/30 flex items-center justify-between rounded-xl px-4 py-3">
              <span className="text-base font-semibold">الرصيد الختامي</span>
              <span
                className={cn(
                  "text-xl font-bold tabular-nums",
                  Number(cash.closing_cash) < 0 && "text-destructive",
                )}
              >
                {formatMoney(cash.closing_cash)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wallet className="size-4" />
              صافي حركة اليوم
            </CardDescription>
            <CardTitle
              className={cn(
                "text-3xl tabular-nums",
                Number(cash.closing_cash) - Number(cash.opening_cash) < 0 && "text-destructive",
              )}
            >
              {formatMoney(Number(cash.closing_cash) - Number(cash.opening_cash))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm leading-relaxed">
              الفرق بين الرصيد الختامي والافتتاحي. رقم موجب يعني أن الصندوق زاد
              اليوم، لا أن المحل ربح — الربح يُحتسب من المبيعات والتكلفة.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative";
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={cn("text-muted-foreground", muted && "italic")}>{label}</span>
      <span
        className={cn(
          "font-medium tabular-nums",
          Number(value) === 0
            ? "text-muted-foreground"
            : tone === "positive"
              ? "text-success"
              : "text-destructive",
        )}
      >
        {Number(value) === 0 ? "—" : formatMoney(value)}
      </span>
    </div>
  );
}
