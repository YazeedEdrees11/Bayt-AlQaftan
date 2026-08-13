"use client";

import { useState, useTransition } from "react";
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
import { PaymentDialog } from "./payment-dialog";
import { CompleteDraftDialog } from "./complete-draft-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  cancelPurchaseAction,
  deleteDraftPurchaseAction,
} from "@/app/actions/purchases";
import { formatMoney } from "@/lib/utils/format";
import type { PurchaseWithDetails } from "@/types/purchasing";

export function PurchaseActions({
  purchase,
  canPay,
  canCancel,
  canComplete,
}: {
  purchase: PurchaseWithDetails;
  canPay: boolean;
  canCancel: boolean;
  canComplete: boolean;
}) {
  const router = useRouter();
  const [payOpen, setPayOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isCompleted = purchase.status === "COMPLETED";
  const isDraft = purchase.status === "DRAFT";
  const owes = Number(purchase.remaining_amount) > 0;

  function deleteDraft() {
    startTransition(async () => {
      const result = await deleteDraftPurchaseAction({
        purchase_id: purchase.id,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("تم حذف المسودة");
      router.push("/purchases");
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
      const result = await cancelPurchaseAction({
        purchase_id: purchase.id,
        reason,
      });

      if (!result.ok) {
        setCancelError(result.error);
        return;
      }

      toast.success("تم إلغاء المشتريات");
      if (result.data && Number(result.data.supplier_credit) > 0) {
        toast.info(
          `تم عكس المبلغ على حساب المورد. المبلغ المدفوع مسبقاً (${formatMoney(
            result.data.supplier_credit,
          )}) يظهر الآن كرصيد دائن لدى المورد.`,
          { duration: 8000 },
        );
      }
      setCancelOpen(false);
      router.refresh();
    });
  }

  // A draft has produced no stock and no charge yet: it can be completed or
  // thrown away. Anything already completed must be cancelled instead.
  if (isDraft) {
    return (
      <>
        {canComplete ? (
          <Button onClick={() => setCompleteOpen(true)}>
            <CheckCircle2 className="size-4" />
            إكمال المشتريات
          </Button>
        ) : null}

        {canCancel ? (
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={isPending}
          >
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            حذف المسودة
          </Button>
        ) : null}

        {completeOpen ? (
          <CompleteDraftDialog
            open={completeOpen}
            onOpenChange={setCompleteOpen}
            purchaseId={purchase.id}
            supplierId={purchase.supplier_id}
            purchaseNumber={purchase.purchase_number}
            total={Number(purchase.total_amount)}
          />
        ) : null}

        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="حذف المسودة"
          description="سيتم حذف هذه المسودة نهائياً. لم تؤثر على المخزون أو حساب المورد، لذا لا يوجد ما يتم عكسه."
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
          إلغاء المشتريات
        </Button>
      ) : null}

      {payOpen ? (
        <PaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          supplierId={purchase.supplier_id}
          defaultPurchaseId={purchase.id}
          purchases={[
            {
              id: purchase.id,
              purchase_number: purchase.purchase_number,
              remaining_amount: Number(purchase.remaining_amount),
            },
          ]}
        />
      ) : null}

      <Dialog
        open={cancelOpen}
        onOpenChange={isPending ? undefined : setCancelOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إلغاء المشتريات</DialogTitle>
            <DialogDescription className="leading-relaxed">
              سيتم عكس الكميات من المخزون وعكس المبلغ على حساب المورد. لا يتم
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

            {Number(purchase.paid_amount) > 0 ? (
              <p className="border-gold/40 bg-gold/10 text-warning-foreground rounded-xl border px-3.5 py-3 text-sm leading-relaxed">
                تم دفع {formatMoney(purchase.paid_amount)} على هذه الفاتورة.
                بعد الإلغاء سيظهر هذا المبلغ كرصيد دائن لدى المورد، ويحتاج إلى
                تسوية أو استرداد خارج النظام.
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
                placeholder="مثال: البضاعة أُعيدت للمورد."
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
