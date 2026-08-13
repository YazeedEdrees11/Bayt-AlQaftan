import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  StickyNote,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ActiveBadge } from "@/components/catalog/stock-badge";
import { CustomerAccountTabs } from "@/components/customers/customer-account-tabs";
import { CustomerHeaderActions } from "@/components/customers/customer-header-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import {
  getCustomerBalance,
  getCustomerById,
  getCustomerLedger,
  getCustomerPayments,
  getOutstandingSales,
  listSales,
} from "@/lib/sales/queries";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "تفاصيل العميل" };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requirePermission("VIEW_CUSTOMERS");
  const { id } = await params;

  const customer = await getCustomerById(id);
  if (!customer) notFound();

  const canUpdate = hasPermission(profile, "UPDATE_CUSTOMERS");
  const canSeeBalance = hasPermission(profile, "VIEW_CUSTOMER_BALANCES");
  const canPay = hasPermission(profile, "CREATE_CUSTOMER_PAYMENTS");
  const canSell = hasPermission(profile, "CREATE_SALES");
  const canSeeProfit = hasPermission(profile, "VIEW_PROFIT");

  const [balance, sales, payments, ledger, outstanding] = await Promise.all([
    canSeeBalance ? getCustomerBalance(id) : Promise.resolve(null),
    listSales({ customerId: id, perPage: 50 }),
    canSeeBalance ? getCustomerPayments(id) : Promise.resolve([]),
    canSeeBalance ? getCustomerLedger(id) : Promise.resolve([]),
    canPay ? getOutstandingSales(id) : Promise.resolve([]),
  ]);

  const owed = Number(balance?.balance ?? 0);
  const lastSale = sales.rows.find((row) => row.status === "COMPLETED");

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name}
        description={`رقم العميل: ${customer.customer_number}`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/customers">
                <ChevronRight className="size-4" />
                العملاء
              </Link>
            </Button>
            {canSell && customer.is_active ? (
              <Button asChild variant="outline">
                <Link href={`/sales/new?customer=${customer.id}`}>
                  <Plus className="size-4" />
                  بيع جديد
                </Link>
              </Button>
            ) : null}
            <CustomerHeaderActions
              customer={customer}
              outstandingSales={outstanding.map((sale) => ({
                id: sale.id,
                sale_number: sale.sale_number,
                remaining_amount: Number(sale.remaining_amount),
              }))}
              canUpdate={canUpdate}
              canPay={canPay}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ActiveBadge isActive={customer.is_active} />
        <span className="text-muted-foreground text-sm">
          أُضيف في {formatDate(customer.created_at)}
        </span>
      </div>

      {/* ----------------------------------------------------------- summary */}
      <div
        className={cn(
          "grid gap-4",
          canSeeBalance ? "sm:grid-cols-2 xl:grid-cols-5" : "sm:grid-cols-3",
        )}
      >
        <SummaryCard
          label="إجمالي المشتريات"
          value={
            canSeeBalance
              ? formatMoney(balance?.total_sales ?? 0)
              : formatMoney(
                  sales.rows
                    .filter((r) => r.status === "COMPLETED")
                    .reduce((sum, r) => sum + Number(r.total_amount), 0),
                )
          }
        />
        <SummaryCard
          label="عدد العمليات"
          value={formatNumber(
            sales.rows.filter((r) => r.status === "COMPLETED").length,
          )}
        />
        <SummaryCard
          label="آخر عملية شراء"
          value={lastSale ? formatDate(lastSale.sale_date) : "—"}
        />

        {canSeeBalance ? (
          <>
            <SummaryCard
              label="إجمالي المدفوع"
              value={formatMoney(balance?.total_paid ?? 0)}
              tone="positive"
            />
            <Card
              className={cn(
                owed > 0 && "border-destructive/30 bg-destructive/5",
                owed < 0 && "border-gold/40 bg-gold/5",
              )}
            >
              <CardContent className="space-y-1 p-5">
                <p className="text-muted-foreground text-sm">
                  {owed < 0 ? "رصيد دائن للعميل" : "الرصيد المستحق"}
                </p>
                <p
                  className={cn(
                    "text-2xl font-semibold tabular-nums",
                    owed > 0 && "text-destructive",
                    owed < 0 && "text-warning-foreground",
                  )}
                >
                  {formatMoney(Math.abs(owed))}
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {owed === 0
                    ? "لا يوجد مبلغ مستحق"
                    : owed > 0
                      ? "مبلغ مستحق على العميل"
                      : "مبلغ مدفوع زائد — يحتاج تسوية أو استرداد."}
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* ----------------------------------------------------------- contact */}
      <Card>
        <CardHeader>
          <CardTitle>بيانات العميل</CardTitle>
          <CardDescription>وسائل التواصل والملاحظات.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            icon={<Phone className="size-3.5" />}
            label="الهاتف"
            value={customer.phone}
            href={customer.phone ? `tel:${customer.phone}` : undefined}
          />
          <Field
            icon={<MessageCircle className="size-3.5" />}
            label="واتساب"
            value={customer.whatsapp}
            href={
              customer.whatsapp
                ? `https://wa.me/${customer.whatsapp.replace(/[^0-9]/g, "")}`
                : undefined
            }
          />
          <Field
            icon={<Mail className="size-3.5" />}
            label="البريد الإلكتروني"
            value={customer.email}
            href={customer.email ? `mailto:${customer.email}` : undefined}
          />
          <Field
            icon={<MapPin className="size-3.5" />}
            label="العنوان"
            value={customer.address}
          />
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
              <StickyNote className="size-3.5" />
              ملاحظات
            </p>
            <p className="text-sm leading-relaxed">
              {customer.notes ?? "لا توجد ملاحظات."}
            </p>
          </div>
        </CardContent>
      </Card>

      <CustomerAccountTabs
        sales={sales.rows}
        payments={payments}
        ledger={ledger}
        canSeeProfit={canSeeProfit}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive";
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p
          className={cn(
            "text-2xl font-semibold tabular-nums",
            tone === "positive" && "text-success",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function Field({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        {icon}
        {label}
      </p>
      {value ? (
        href ? (
          <a
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="hover:text-primary text-sm font-medium hover:underline"
          >
            <bdi>{value}</bdi>
          </a>
        ) : (
          <p className="text-sm font-medium">
            <bdi>{value}</bdi>
          </p>
        )
      ) : (
        <p className="text-muted-foreground text-sm">—</p>
      )}
    </div>
  );
}
