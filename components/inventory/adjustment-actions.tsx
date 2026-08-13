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
import { cancelAdjustmentAction } from "@/app/actions/returns";
import type { AdjustmentWithDetails } from "@/types/returns";

export function AdjustmentActions({
  adjustment,
  canCancel,
}: {
  adjustment: AdjustmentWithDetails;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (adjustment.status !== "COMPLETED" || !canCancel) return null;

  function cancel() {
    setError(null);
    if (!reason.trim()) {
      setError("سبب الإلغاء مطلوب.");
      return;
    }
    startTransition(async () => {
      const result = await cancelAdjustmentAction({
        adjustment_id: adjustment.id,
        reason,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("تم إلغاء التعديل وعكس فروقات الكميات");
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
        إلغاء التعديل
      </Button>

      <Dialog open={open} onOpenChange={isPending ? undefined : setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إلغاء تعديل المخزون</DialogTitle>
            <DialogDescription className="leading-relaxed">
              سيتم تسجيل حركات معاكسة لكل فرق في هذا التعديل. إذا بيعت الكميات
              المضافة فلن يكون الإلغاء ممكناً.
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
              <Label htmlFor="cancel_adjustment_reason">
                سبب الإلغاء <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="cancel_adjustment_reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="مثال: تم إدخال أرقام الجرد بالخطأ."
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
