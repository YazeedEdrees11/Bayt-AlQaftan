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
import { SupplierEditButton } from "@/components/suppliers/supplier-edit-button";
import { SupplierAccountTabs } from "@/components/suppliers/supplier-account-tabs";
import { SupplierPaymentButton } from "@/components/suppliers/supplier-payment-button";
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
import { countSupplierVariants, getSupplierById } from "@/lib/catalog/queries";
import {
  getOutstandingPurchases,
  getSupplierBalance,
  getSupplierLedger,
  getSupplierPayments,
  listPurchases,
} from "@/lib/purchasing/queries";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "تفاصيل المورد" };

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requirePermission("VIEW_SUPPLIERS");
  const { id } = await params;

  const supplier = await getSupplierById(id);
  if (!supplier) notFound();

  const canUpdate = hasPermission(profile, "UPDATE_SUPPLIERS");
  const canSeeBalance = hasPermission(profile, "VIEW_SUPPLIER_BALANCES");
  const canPay = hasPermission(profile, "CREATE_SUPPLIER_PAYMENTS");
  const canBuy = hasPermission(profile, "CREATE_PURCHASES");

  const [variantCount, balance, purchases, payments, ledger, outstanding] =
    await Promise.all([
      countSupplierVariants(id),
      canSeeBalance
        ? getSupplierBalance(id)
        : Promise.resolve(null),
      canSeeBalance
        ? listPurchases({ supplierId: id, perPage: 50 })
        : Promise.resolve(null),
      canSeeBalance ? getSupplierPayments(id) : Promise.resolve([]),
      canSeeBalance ? getSupplierLedger(id) : Promise.resolve([]),
      canPay ? getOutstandingPurchases(id) : Promise.resolve([]),
    ]);

  const owed = Number(balance?.balance ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        description="بيانات المورد وحسابه ومشترياته."
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/suppliers">
                <ChevronRight className="size-4" />
                الموردين
              </Link>
            </Button>
            {canBuy && supplier.is_active ? (
              <Button asChild variant="outline">
                <Link href={`/purchases/new?supplier=${supplier.id}`}>
                  <Plus className="size-4" />
                  مشتريات جديدة
                </Link>
              </Button>
            ) : null}
            {canPay ? (
              <SupplierPaymentButton
                supplierId={supplier.id}
                purchases={outstanding.map((purchase) => ({
                  id: purchase.id,
                  purchase_number: purchase.purchase_number,
                  remaining_amount: Number(purchase.remaining_amount),
                }))}
              />
            ) : null}
            {canUpdate ? <SupplierEditButton supplier={supplier} /> : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ActiveBadge isActive={supplier.is_active} />
        <span className="text-muted-foreground text-sm">
          مرتبط بـ {formatNumber(variantCount)} موديل
        </span>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <span className="text-muted-foreground text-sm">
          أُضيف في {formatDate(supplier.created_at)}
        </span>
      </div>

      {/* ----------------------------------------------------------- balance */}
      {canSeeBalance && balance ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="space-y-1 p-5">
              <p className="text-muted-foreground text-sm">إجمالي المشتريات</p>
              <p className="text-2xl font-semibold tabular-nums">
                {formatMoney(balance.total_purchases)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-1 p-5">
              <p className="text-muted-foreground text-sm">إجمالي المدفوع</p>
              <p className="text-success text-2xl font-semibold tabular-nums">
                {formatMoney(balance.total_paid)}
              </p>
            </CardContent>
          </Card>

          <Card
            className={cn(
              owed > 0 && "border-destructive/30 bg-destructive/5",
              owed < 0 && "border-gold/40 bg-gold/5",
            )}
          >
            <CardContent className="space-y-1 p-5">
              <p className="text-muted-foreground text-sm">
                {owed < 0 ? "رصيد دائن لدى المورد" : "المتبقي"}
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
                    ? `مبلغ مستحق: ${formatMoney(owed)}`
                    : "مبلغ مدفوع زائد عن قيمة المشتريات — يحتاج تسوية أو استرداد."}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ----------------------------------------------------------- contact */}
      <Card>
        <CardHeader>
          <CardTitle>بيانات التواصل</CardTitle>
          <CardDescription>وسائل التواصل المسجّلة لهذا المورد.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <ContactField
            icon={<Phone className="size-3.5" />}
            label="الهاتف"
            value={supplier.phone}
            href={supplier.phone ? `tel:${supplier.phone}` : undefined}
          />
          <ContactField
            icon={<MessageCircle className="size-3.5" />}
            label="واتساب"
            value={supplier.whatsapp}
            href={
              supplier.whatsapp
                ? `https://wa.me/${supplier.whatsapp.replace(/[^0-9]/g, "")}`
                : undefined
            }
          />
          <ContactField
            icon={<Mail className="size-3.5" />}
            label="البريد الإلكتروني"
            value={supplier.email}
            href={supplier.email ? `mailto:${supplier.email}` : undefined}
          />
          <ContactField
            icon={<MapPin className="size-3.5" />}
            label="العنوان"
            value={supplier.address}
          />
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
              <StickyNote className="size-3.5" />
              ملاحظات
            </p>
            <p className="text-sm leading-relaxed">
              {supplier.notes ?? "لا توجد ملاحظات."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* -------------------------------------------------------------- tabs */}
      {canSeeBalance ? (
        <SupplierAccountTabs
          purchases={purchases?.rows ?? []}
          payments={payments}
          ledger={ledger}
        />
      ) : null}
    </div>
  );
}

function ContactField({
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
