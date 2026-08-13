"use client";

import { useState, useTransition } from "react";
import { useIdempotencyKey } from "@/lib/hooks/use-idempotency-key";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, LoaderCircle } from "lucide-react";
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
import { createTransferAction } from "@/app/actions/finance";
import { formatMoney } from "@/lib/utils/format";
import type { AccountBalance } from "@/types/finance";

/**
 * Moves money between the shop's own accounts.
 *
 * A transfer is not income and not spending — it leaves total business money
 * unchanged — so both legs are recorded with TRANSFER types that the cash-flow
 * and profit reports exclude.
 */
export function TransferDialog({ accounts }: { accounts: AccountBalance[] }) {
  const { key, reset: resetKey } = useIdempotencyKey();
  const router = useRouter();
  const active = accounts.filter((account) => account.is_active);

  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [transferDate, setTransferDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const from = active.find((account) => account.account_id === fromId);
  const value = Number(amount);
  const amountValid = Number.isFinite(value) && value > 0;
  const overdraws = !!from && amountValid && value > Number(from.balance);
  const canSubmit = !!fromId && !!toId && fromId !== toId && amountValid && !overdraws;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createTransferAction({
        from_account_id: fromId,
        to_account_id: toId,
        amount,
        transfer_date: transferDate,
        notes: notes.trim() || undefined,
      }, key());

      if (!result.ok) {
        setError(result.error);
        return;
      }
    // The operation is done; the next submission from this form is a
    // new one and must not be answered from this one's result.
    resetKey();
      toast.success(`تم التحويل — ${result.data!.transfer_number}`);
      setOpen(false);
      setAmount("");
      setNotes("");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={active.length < 2}>
        <ArrowLeftRight className="size-4" />
        تحويل بين الحسابات
      </Button>

      <Dialog open={open} onOpenChange={isPending ? undefined : setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تحويل بين الحسابات</DialogTitle>
            <DialogDescription className="leading-relaxed">
              نقل المال بين حساباتك لا يُعدّ دخلاً ولا مصروفاً — إجمالي أموال
              المحل لا يتغيّر.
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
              <div className="space-y-2">
                <Label htmlFor="transfer_from">من حساب</Label>
                <Select value={fromId} onValueChange={setFromId} disabled={isPending}>
                  <SelectTrigger id="transfer_from" className="h-11 w-full">
                    <SelectValue placeholder="اختر الحساب" />
                  </SelectTrigger>
                  <SelectContent>
                    {active.map((account) => (
                      <SelectItem key={account.account_id} value={account.account_id}>
                        {account.name} — {formatMoney(account.balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transfer_to">إلى حساب</Label>
                <Select value={toId} onValueChange={setToId} disabled={isPending}>
                  <SelectTrigger id="transfer_to" className="h-11 w-full">
                    <SelectValue placeholder="اختر الحساب" />
                  </SelectTrigger>
                  <SelectContent>
                    {active
                      .filter((account) => account.account_id !== fromId)
                      .map((account) => (
                        <SelectItem key={account.account_id} value={account.account_id}>
                          {account.name} — {formatMoney(account.balance)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transfer_amount">المبلغ</Label>
                <Input
                  id="transfer_amount"
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
                    الرصيد غير كافٍ — المتاح {formatMoney(from!.balance)}.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="transfer_date">التاريخ</Label>
                <Input
                  id="transfer_date"
                  type="date"
                  className="h-11"
                  value={transferDate}
                  onChange={(event) => setTransferDate(event.target.value)}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="transfer_notes">ملاحظات</Label>
                <Textarea
                  id="transfer_notes"
                  rows={2}
                  value={notes}
                  placeholder="مثال: إيداع نقدية اليوم في البنك."
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
            <Button type="button" onClick={submit} disabled={!canSubmit || isPending}>
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري التحويل...
                </>
              ) : (
                "تأكيد التحويل"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
