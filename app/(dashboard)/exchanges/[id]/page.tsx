import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, ChevronRight, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ExchangeActions } from "@/components/exchanges/exchange-actions";
import {
  ConditionBadge,
  ExchangeDirectionBadge,
  ReturnStatusBadge,
  SettlementMethodBadge,
  WalkInCell,
} from "@/components/returns/return-badges";
import { ProductThumb } from "@/components/catalog/product-thumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { getExchangeById } from "@/lib/returns/queries";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { RETURN_REASON_LABELS, type ExchangeItem } from "@/types/returns";

export const metadata: Metadata = { title: "تفاصيل الاستبدال" };

export default async function ExchangeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requirePermission("VIEW_EXCHANGES");
  const { id } = await params;

  const exchange = await getExchangeById(id);
  if (!exchange) notFound();

  const canCancel = hasPermission(profile, "CANCEL_EXCHANGES");
  const canSeeProfit = hasPermission(profile, "VIEW_PROFIT");

  return (
    <div className="space-y-6">
      <PageHeader
        title={exchange.exchange_number}
        description={`استبدال بتاريخ ${formatDate(exchange.exchange_date)}`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/exchanges">
                <ChevronRight className="size-4" />
                الاستبدالات
              </Link>
            </Button>
            <ExchangeActions exchange={exchange} canCancel={canCancel} />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ReturnStatusBadge status={exchange.status} />
        <ExchangeDirectionBadge direction={exchange.difference_direction} />
        <Link
          href={`/sales/${exchange.sale_id}`}
          className="text-primary text-sm hover:underline"
        >
          <bdi>{exchange.sale_number}</bdi>
        </Link>
        {exchange.customer ? (
          <Link
            href={`/customers/${exchange.customer.id}`}
            className="text-primary text-sm hover:underline"
          >
            {exchange.customer.name}
          </Link>
        ) : (
          <WalkInCell name={null} />
        )}
        {exchange.created_by_name ? (
          <span className="text-muted-foreground text-sm">
            · سجّله {exchange.created_by_name}
          </span>
        ) : null}
      </div>

      {exchange.status === "CANCELLED" ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-1 py-4 text-sm">
            <p className="text-destructive font-medium">
              تم إلغاء هذا الاستبدال
              {exchange.cancelled_at
                ? ` بتاريخ ${formatDateTime(exchange.cancelled_at)}`
                : ""}
            </p>
            {exchange.cancel_reason ? (
              <p className="text-muted-foreground leading-relaxed">
                السبب: {exchange.cancel_reason}
              </p>
            ) : null}
            <p className="text-muted-foreground leading-relaxed">
              تم عكس حركتي المخزون معاً. الحركات الأصلية محفوظة كما هي.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <ItemsCard
          title="المنتج المرتجع"
          description="عاد إلى المخزون (أو إلى التالف عند اختيار ذلك)."
          items={exchange.returned_items}
          showCondition
        />
        <ItemsCard
          title="المنتج البديل"
          description="خرج من المخزون المتاح."
          items={exchange.new_items}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الفرق والتسوية</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="ms-auto w-full max-w-sm space-y-2.5 text-sm">
            <Row label="قيمة المرتجع" value={formatMoney(exchange.returned_amount)} />
            <Row label="قيمة البديل" value={formatMoney(exchange.new_items_amount)} />
            <Separator />
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {exchange.difference_direction === "CUSTOMER_PAYS"
                  ? "العميل يدفع"
                  : exchange.difference_direction === "CUSTOMER_RECEIVES"
                    ? "العميل يستلم"
                    : "الفرق"}
              </span>
              <span
                className={cn(
                  "text-lg font-semibold",
                  exchange.difference_direction === "CUSTOMER_PAYS" && "text-success",
                  exchange.difference_direction === "CUSTOMER_RECEIVES" &&
                    "text-destructive",
                )}
              >
                {formatMoney(exchange.difference_amount)}
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-muted-foreground">طريقة التسوية</span>
              <SettlementMethodBadge method={exchange.settlement_method} />
            </div>
            {exchange.bank_name ? (
              <Row label="البنك" value={exchange.bank_name} />
            ) : null}
            {exchange.transfer_reference ? (
              <Row label="رقم التحويل" value={exchange.transfer_reference} />
            ) : null}
            {exchange.receipt_url ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">الإيصال</span>
                <Button asChild variant="outline" size="sm">
                  <a
                    href={exchange.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-3.5" />
                    عرض الإيصال
                  </a>
                </Button>
              </div>
            ) : null}

            {canSeeProfit ? (
              <>
                <Separator />
                <Row
                  label="أثر الاستبدال على الربح"
                  value={formatMoney(exchange.profit_delta)}
                  tone={exchange.profit_delta >= 0 ? "positive" : "negative"}
                />
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {exchange.reason ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">سبب الاستبدال</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{RETURN_REASON_LABELS[exchange.reason]}</p>
          </CardContent>
        </Card>
      ) : null}

      {exchange.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ملاحظات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{exchange.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ItemsCard({
  title,
  description,
  items,
  showCondition = false,
}: {
  title: string;
  description: string;
  items: (ExchangeItem & { image_url: string | null })[];
  showCondition?: boolean;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowLeftRight className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-14 text-start">الصورة</TableHead>
                <TableHead className="text-start">المنتج</TableHead>
                <TableHead className="text-start">الكمية</TableHead>
                {showCondition ? (
                  <TableHead className="text-start">الحالة</TableHead>
                ) : null}
                <TableHead className="text-start">القيمة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <ProductThumb
                      url={item.image_url}
                      alt={item.product_name_snapshot}
                      className="size-10"
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{item.product_name_snapshot}</p>
                    <p className="text-muted-foreground text-xs">
                      <bdi>{item.variant_sku_snapshot}</bdi>
                      {item.color_snapshot ? ` · ${item.color_snapshot}` : ""}
                      {item.size_snapshot ? ` · ${item.size_snapshot}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm font-medium tabular-nums">
                    {formatNumber(item.quantity)}
                  </TableCell>
                  {showCondition ? (
                    <TableCell>
                      <ConditionBadge condition={item.condition} />
                    </TableCell>
                  ) : null}
                  <TableCell className="text-sm font-medium">
                    {formatMoney(item.total_amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}
