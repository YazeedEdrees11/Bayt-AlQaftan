"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { createAdjustmentAction } from "@/app/actions/finance";
import { formatMoney } from "@/lib/utils/format";
import {
  DIRECTION_LABELS,
  FINANCIAL_DIRECTIONS,
  type AccountBalance,
  type FinancialTransactionDirection,
} from "@/types/finance";

/**
 * Corrects an account balance by hand — ADMIN only.
 *
 * This is the one operation that can make the books say anything, so it always
 * leaves a reason and an audit entry, and it posts a normal ledger movement
 * rather than editing anything that already exists.
 */
export function AdjustmentDialog({ accounts }: { accounts: AccountBalance[] }) {
  const router = useRouter();
  const active = accounts.filter((account) => account.is_active);

  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [direction, setDirection] = useState<FinancialTransactionDirection>("IN");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const account = active.find((a) => a.account_id === accountId);
  const value = Number(amount);
  const amountValid = Number.isFinite(value) && value > 0;
  const overdraws =
    !!account && direction === "OUT" && amountValid && value > Number(account.balance);
  const canSubmit = !!accountId && amountValid && reason.trim().length >= 3 && !overdraws;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createAdjustmentAction({
        financial_account_id: accountId,
        amount,
        direction,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`تم تسجيل التعديل — ${result.data!.adjustment_number}`);
      setOpen(false);
      setAmount("");
      setReason("");
      setNotes("");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
        disabled={active.length === 0}
      >
        <SlidersHorizontal className="size-4" />
        تعديل رصيد
      </Button>

      <Dialog open={open} onOpenChange={isPending ? undefined : setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل رصيد حساب</DialogTitle>
            <DialogDescription className="leading-relaxed">
              يُسجَّل التعديل كحركة مالية مستقلة بسبب مذكور — لا يُعدَّل أي سجل
              قائم. استخدمه فقط لتصحيح فرق حقيقي بين الرصيد الفعلي والمسجّل.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error ? (
              <p
                role="alert"
                className="border-destructive/25 bg-destructive/8 text-destructive rounded-xl border px-3.5 py-3 text-sm leading-relaxed"
              >
                {error}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="adjustment_account">الحساب</Label>
                <Select value={accountId} onValueChange={setAccountId} disabled={isPending}>
                  <SelectTrigger id="adjustment_account" className="h-11 w-full">
                    <SelectValue placeholder="اختر الحساب" />
                  </SelectTrigger>
                  <SelectContent>
                    {active.map((a) => (
                      <SelectItem key={a.account_id} value={a.account_id}>
                        {a.name} — {formatMoney(a.balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustment_direction">الاتجاه</Label>
                <Select
                  value={direction}
                  onValueChange={(v) => setDirection(v as FinancialTransactionDirection)}
                  disabled={isPending}
                >
                  <SelectTrigger id="adjustment_direction" className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINANCIAL_DIRECTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {DIRECTION_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustment_amount">المبلغ</Label>
                <Input
                  id="adjustment_amount"
                  inputMode="decimal"
                  dir="ltr"
                  className="h-11 text-left"
                  placeholder="0.00"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={isPending}
                />
                {overdraws ? (
                  <p className="text-destructive text-xs">
                    الرصيد غير كافٍ — المتاح {formatMoney(account!.balance)}.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="adjustment_reason">
                  السبب <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="adjustment_reason"
                  className="h-11"
                  placeholder="مثال: فرق جرد الصندوق."
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="adjustment_notes">ملاحظات</Label>
                <Textarea
                  id="adjustment_notes"
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              تراجع
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={submit}
              disabled={!canSubmit || isPending}
            >
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                "تأكيد التعديل"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
