"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useIdempotencyKey } from "@/lib/hooks/use-idempotency-key";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, LoaderCircle, Paperclip, Receipt, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EXPENSE_RECEIPT_ACCEPT } from "./expense-accept";
import { createExpenseAction, uploadExpenseReceiptAction } from "@/app/actions/finance";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import {
  EXPENSE_METHOD_LABELS,
  EXPENSE_PAYMENT_METHODS,
  type ExpenseCategory,
  type ExpensePaymentMethod,
  type FinancialAccount,
} from "@/types/finance";

type AccountOption = Pick<FinancialAccount, "id" | "name" | "account_type" | "is_default">;

/**
 * Records an expense.
 *
 * Two rules shape it. The account list narrows to match the payment method —
 * cash does not come out of a bank account (§10) — and the balance guard lives
 * in the database, so an expense larger than the account holds is refused there
 * and neither the expense nor its ledger row is written (§96).
 */
export function ExpenseForm({
  categories,
  accounts,
}: {
  categories: ExpenseCategory[];
  accounts: AccountOption[];
}) {
  const { key, reset: resetKey } = useIdempotencyKey();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<ExpensePaymentMethod>("CASH");
  const [accountOverride, setAccountOverride] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const receiptInput = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [created, setCreated] = useState<{
    id: string;
    expense_number: string;
    amount: number;
  } | null>(null);

  // Only accounts that can actually settle this method are offered.
  const eligible = useMemo(
    () =>
      accounts.filter((a) =>
        method === "CASH" ? a.account_type === "CASH" : a.account_type === "BANK",
      ),
    [accounts, method],
  );

  // Derived, not stored: switching method must not leave a stale bank account
  // selected against a cash payment.
  const accountId =
    accountOverride && eligible.some((a) => a.id === accountOverride)
      ? accountOverride
      : (eligible.find((a) => a.is_default)?.id ?? eligible[0]?.id ?? "");

  const value = Number(amount);
  const amountValid = Number.isFinite(value) && value > 0;
  const canSubmit = !!categoryId && amountValid && !!accountId;

  function submit() {
    setError(null);
    startTransition(async () => {
      let receiptPath = "";
      if (receiptFile) {
        const formData = new FormData();
        formData.set("key", categoryId);
        formData.set("file", receiptFile);
        const uploaded = await uploadExpenseReceiptAction(formData);
        if (!uploaded.ok) {
          setError(uploaded.error);
          return;
        }
        receiptPath = uploaded.data?.path ?? "";
      }

      const result = await createExpenseAction({
        expense_category_id: categoryId,
        amount,
        expense_date: expenseDate,
        payment_method: method,
        financial_account_id: accountId,
        description: description.trim() || undefined,
        receipt_image_path: receiptPath || undefined,
      }, key());

      if (!result.ok) {
        setError(result.error);
        return;
      }
    // The operation is done; the next submission from this form is a
    // new one and must not be answered from this one's result.
    resetKey();
      setCreated(result.data!);
      router.refresh();
    });
  }

  if (created) {
    return (
      <Card className="border-success/30 bg-success/5">
        <CardContent className="space-y-4 py-8 text-center">
          <CheckCircle2 className="text-success mx-auto size-10" />
          <div className="space-y-1">
            <p className="text-lg font-semibold">تم تسجيل المصروف</p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              خُصم المبلغ من الحساب المختار وسُجّلت الحركة المالية.
            </p>
          </div>

          <div className="mx-auto grid max-w-sm gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">رقم المصروف</span>
              <span className="font-medium">{created.expense_number}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">المبلغ</span>
              <span className="font-medium">{formatMoney(created.amount)}</span>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={`/expenses/${created.id}`}>عرض المصروف</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreated(null);
                setAmount("");
                setDescription("");
                setReceiptFile(null);
              }}
            >
              مصروف جديد
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="border-destructive/25 bg-destructive/8 text-destructive rounded-xl border px-3.5 py-3 text-sm leading-relaxed"
        >
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>بيانات المصروف</CardTitle>
          <CardDescription>
            يُخصم المبلغ من الحساب المختار فور الحفظ.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expense_category">
                التصنيف <span className="text-destructive">*</span>
              </Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="expense_category" className="h-11 w-full">
                  <SelectValue placeholder="اختر التصنيف" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense_amount">
                المبلغ <span className="text-destructive">*</span>
              </Label>
              <Input
                id="expense_amount"
                inputMode="decimal"
                dir="ltr"
                className={cn("h-11 text-left", amount && !amountValid && "border-destructive")}
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              {amount && !amountValid ? (
                <p className="text-destructive text-xs">
                  أدخل مبلغاً صحيحاً أكبر من صفر.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense_date">
                التاريخ <span className="text-destructive">*</span>
              </Label>
              <Input
                id="expense_date"
                type="date"
                className="h-11"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense_method">طريقة الدفع</Label>
              <Select
                value={method}
                onValueChange={(next) => {
                  setMethod(next as ExpensePaymentMethod);
                  setAccountOverride(null);
                }}
              >
                <SelectTrigger id="expense_method" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_PAYMENT_METHODS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {EXPENSE_METHOD_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="expense_account">
                الحساب <span className="text-destructive">*</span>
              </Label>
              {eligible.length === 0 ? (
                <p className="text-destructive border-destructive/25 bg-destructive/8 rounded-xl border px-3.5 py-3 text-sm">
                  لا يوجد حساب {method === "CASH" ? "نقدي" : "بنكي"} مفعّل. أضف
                  حساباً من صفحة الحسابات المالية أولاً.
                </p>
              ) : (
                <Select value={accountId} onValueChange={setAccountOverride}>
                  <SelectTrigger id="expense_account" className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eligible.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                        {account.is_default ? " (افتراضي)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-muted-foreground text-xs">
                تظهر الحسابات المطابقة لطريقة الدفع فقط — النقد من الصندوق
                والتحويل من البنك.
              </p>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="expense_description">الوصف</Label>
              <Textarea
                id="expense_description"
                rows={3}
                value={description}
                placeholder="مثال: إيجار شهر آب."
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>الإيصال</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => receiptInput.current?.click()}
                  disabled={isPending}
                >
                  <Paperclip className="size-4" />
                  رفع الإيصال
                </Button>
                {receiptFile ? (
                  <span className="text-muted-foreground flex items-center gap-2 text-sm">
                    <bdi className="max-w-[12rem] truncate">{receiptFile.name}</bdi>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setReceiptFile(null)}
                      aria-label="إزالة الإيصال"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    اختياري · JPG، PNG أو WEBP
                  </span>
                )}
              </div>
              <input
                ref={receiptInput}
                type="file"
                accept={EXPENSE_RECEIPT_ACCEPT}
                className="hidden"
                onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              size="lg"
              disabled={!canSubmit || isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Receipt className="size-4" />
                  حفظ المصروف
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={() => router.push("/expenses")}
              disabled={isPending}
            >
              إلغاء
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="تأكيد تسجيل المصروف؟"
        description="سيتم خصم المبلغ من الحساب المختار وتسجيل حركة مالية صادرة."
        confirmLabel="تأكيد وحفظ"
        onConfirm={submit}
      />
    </div>
  );
}
