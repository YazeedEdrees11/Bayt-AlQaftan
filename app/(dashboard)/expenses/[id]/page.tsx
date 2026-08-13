import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ExpenseActions } from "@/components/finance/expense-actions";
import { Badge } from "@/components/ui/badge";
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
import { getExpenseById } from "@/lib/finance/queries";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { EXPENSE_METHOD_LABELS, EXPENSE_STATUS_LABELS } from "@/types/finance";

export const metadata: Metadata = { title: "تفاصيل المصروف" };

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requirePermission("VIEW_EXPENSES");
  const { id } = await params;

  const expense = await getExpenseById(id);
  if (!expense) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={expense.expense_number}
        description={`مصروف بتاريخ ${formatDate(expense.expense_date)}`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/expenses">
                <ChevronRight className="size-4" />
                المصاريف
              </Link>
            </Button>
            <ExpenseActions
              expense={expense}
              canCancel={hasPermission(profile, "CANCEL_EXPENSE")}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "font-medium",
            expense.status === "COMPLETED"
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-destructive/10 text-destructive border-destructive/25",
          )}
        >
          {EXPENSE_STATUS_LABELS[expense.status]}
        </Badge>
        <Badge variant="outline" className="font-normal">
          {expense.category_name}
        </Badge>
        {expense.created_by_name ? (
          <span className="text-muted-foreground text-sm">
            · سجّله {expense.created_by_name}
          </span>
        ) : null}
      </div>

      {expense.status === "CANCELLED" ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-1 py-4 text-sm">
            <p className="text-destructive font-medium">
              تم إلغاء هذا المصروف
              {expense.cancelled_at ? ` بتاريخ ${formatDateTime(expense.cancelled_at)}` : ""}
            </p>
            {expense.cancel_reason ? (
              <p className="text-muted-foreground leading-relaxed">
                السبب: {expense.cancel_reason}
              </p>
            ) : null}
            <p className="text-muted-foreground leading-relaxed">
              أُعيد المبلغ إلى {expense.account_name} بحركة مالية واردة. المصروف
              الأصلي محفوظ كما هو.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>البيانات</CardTitle>
            <CardDescription>
              كل مصروف يقابله حركة مالية صادرة من الحساب المختار.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="رقم المصروف" value={expense.expense_number} ltr />
              <Field label="التاريخ" value={formatDate(expense.expense_date)} />
              <Field label="التصنيف" value={expense.category_name} />
              <Field
                label="طريقة الدفع"
                value={EXPENSE_METHOD_LABELS[expense.payment_method]}
              />
              <Field label="الحساب" value={expense.account_name} />
              <Field
                label="نوع الحساب"
                value={expense.account_type === "CASH" ? "صندوق" : "بنك"}
              />
              <div className="sm:col-span-2">
                <Field label="الوصف" value={expense.description ?? "—"} />
              </div>
              <Field label="سُجّل في" value={formatDateTime(expense.created_at)} />
              <Field label="المستخدم" value={expense.created_by_name ?? "—"} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>المبلغ</CardDescription>
              <CardTitle
                className={cn(
                  "text-4xl tabular-nums",
                  expense.status === "CANCELLED" && "text-muted-foreground line-through",
                )}
              >
                {formatMoney(expense.amount)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm leading-relaxed">
                خُصم من {expense.account_name}.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">الإيصال</CardTitle>
            </CardHeader>
            <CardContent>
              {expense.receipt_url ? (
                <Button asChild variant="outline" className="w-full">
                  <a href={expense.receipt_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" />
                    عرض الإيصال
                  </a>
                </Button>
              ) : (
                <p className="text-muted-foreground text-sm">لم يُرفق إيصال.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  ltr,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      {ltr ? (
        <bdi className="block text-right text-sm font-medium">{value}</bdi>
      ) : (
        <p className="text-sm font-medium">{value}</p>
      )}
    </div>
  );
}
