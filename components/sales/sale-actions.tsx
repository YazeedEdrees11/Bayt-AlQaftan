"use client";

import { useState, useTransition } from "react";
import { useIdempotencyKey } from "@/lib/hooks/use-idempotency-key";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, LoaderCircle, Trash2, Wallet } from "lucide-react";
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SalePaymentDialog } from "./sale-payment-dialog";
import {
  cancelSaleAction,
  completeSaleAction,
  deleteDraftSaleAction,
} from "@/app/actions/sales";
import { formatMoney } from "@/lib/utils/format";
import type { SaleWithDetails } from "@/types/sales";

export function SaleActions({
  sale,
  canPay,
  canCancel,
  canComplete,
}: {
  sale: SaleWithDetails;
  canPay: boolean;
  canCancel: boolean;
  canComplete: boolean;
}) {
  const { key, reset: resetKey } = useIdempotencyKey();
  const router = useRouter();
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDraft = sale.status === "DRAFT";
  const isCompleted = sale.status === "COMPLETED";
  const owes = Number(sale.remaining_amount) > 0;

  function completeDraft() {
    startTransition(async () => {
      const result = await completeSaleAction({ sale_id: sale.id, payments: [] }, key());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
    // The operation is done; the next submission from this form is a
    // new one and must not be answered from this one's result.
    resetKey();
      toast.success("تم إتمام البيع وخصم الكميات من المخزون");
      router.refresh();
    });
  }

  function deleteDraft() {
    startTransition(async () => {
      const result = await deleteDraftSaleAction({ sale_id: sale.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("تم حذف المسودة");
      router.push("/sales");
      router.refresh();
    });
  }

  function cancel() {
    setCancelError(null);
    if (!reason.trim()) {
      setCancelError("سبب الإلغاء مطلوب.");
      return;
    }
    startTransition(async () => {
      const result = await cancelSaleAction({ sale_id: sale.id, reason });
      if (!result.ok) {
        setCancelError(result.error);
        return;
      }
      toast.success("تم إلغاء البيع وإرجاع الكميات إلى المخزون");
      if (result.data && Number(result.data.customer_credit) > 0) {
        toast.info(
          `المبلغ المحصّل مسبقاً (${formatMoney(result.data.customer_credit)}) يظهر الآن كرصيد دائن للعميل.`,
          { duration: 8000 },
        );
      }
      setCancelOpen(false);
      router.refresh();
    });
  }

  // A draft has taken no money and moved no stock: complete it or bin it.
  if (isDraft) {
    return (
      <>
        {canComplete ? (
          <Button onClick={completeDraft} disabled={isPending}>
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            إتمام البيع
          </Button>
        ) : null}

        {canComplete ? (
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={isPending}
          >
            <Trash2 className="size-4" />
            حذف المسودة
          </Button>
        ) : null}

        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="حذف المسودة"
          description="سيتم حذف هذه المسودة نهائياً. لم تؤثر على المخزون أو حساب العميل."
          confirmLabel="حذف"
          destructive
          onConfirm={deleteDraft}
        />
      </>
    );
  }

  if (!isCompleted) return null;

  return (
    <>
      {canPay && owes ? (
        <Button onClick={() => setPayOpen(true)}>
          <Wallet className="size-4" />
          تسجيل دفعة
        </Button>
      ) : null}

      {canCancel ? (
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setCancelOpen(true)}
        >
          <Ban className="size-4" />
          إلغاء البيع
        </Button>
      ) : null}

      {payOpen ? (
        <SalePaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          defaultSaleId={sale.id}
          receiptKey={sale.customer_id ?? "walkin"}
          sales={[
            {
              id: sale.id,
              sale_number: sale.sale_number,
              remaining_amount: Number(sale.remaining_amount),
            },
          ]}
        />
      ) : null}

      <Dialog open={cancelOpen} onOpenChange={isPending ? undefined : setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إلغاء البيع</DialogTitle>
            <DialogDescription className="leading-relaxed">
              سيتم إرجاع الكميات إلى المخزون وعكس المبلغ على حساب العميل. لا يتم
              حذف أي سجل — تبقى الحركات الأصلية كما هي.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {cancelError ? (
              <p
                role="alert"
                className="border-destructive/25 bg-destructive/8 text-destructive rounded-xl border px-3.5 py-3 text-sm leading-relaxed"
              >
                {cancelError}
              </p>
            ) : null}

            {Number(sale.paid_amount) > 0 && sale.customer_id ? (
              <p className="border-gold/40 bg-gold/10 text-warning-foreground rounded-xl border px-3.5 py-3 text-sm leading-relaxed">
                تم تحصيل {formatMoney(sale.paid_amount)} على هذه العملية. بعد
                الإلغاء سيظهر المبلغ كرصيد دائن للعميل ويحتاج إلى تسوية أو
                استرداد خارج النظام.
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="cancel_reason">
                سبب الإلغاء <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="cancel_reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="مثال: العميل أعاد البضاعة."
                disabled={isPending}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelOpen(false)}
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
