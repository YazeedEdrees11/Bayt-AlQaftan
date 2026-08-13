"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, LoaderCircle } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelExpenseAction } from "@/app/actions/finance";
import { formatMoney } from "@/lib/utils/format";
import type { ExpenseWithDetails } from "@/types/finance";

export function ExpenseActions({
  expense,
  canCancel,
}: {
  expense: ExpenseWithDetails;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (expense.status !== "COMPLETED" || !canCancel) return null;

  function cancel() {
    setError(null);
    if (!reason.trim()) {
      setError("سبب الإلغاء مطلوب.");
      return;
    }
    startTransition(async () => {
      const result = await cancelExpenseAction({
        expense_id: expense.id,
        reason,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("تم إلغاء المصروف وإعادة المبلغ إلى الحساب");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Ban className="size-4" />
        إلغاء المصروف
      </Button>

      <Dialog open={open} onOpenChange={isPending ? undefined : setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إلغاء المصروف</DialogTitle>
            <DialogDescription className="leading-relaxed">
              سيتم تسجيل حركة مالية واردة بقيمة {formatMoney(expense.amount)} تعيد
              المبلغ إلى {expense.account_name}. المصروف الأصلي يبقى في السجل ولا
              يُحذف.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {error ? (
              <p
                role="alert"
                className="border-destructive/25 bg-destructive/8 text-destructive rounded-xl border px-3.5 py-3 text-sm leading-relaxed"
              >
                {error}
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="cancel_expense_reason">
                سبب الإلغاء <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="cancel_expense_reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="مثال: سُجّل بالخطأ."
                disabled={isPending}
              />
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
              onClick={cancel}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الإلغاء...
                </>
              ) : (
                "تأكيد الإلغاء"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
