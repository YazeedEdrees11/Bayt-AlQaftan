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
import { cancelExchangeAction } from "@/app/actions/returns";
import { formatMoney } from "@/lib/utils/format";
import type { ExchangeWithDetails } from "@/types/returns";

export function ExchangeActions({
  exchange,
  canCancel,
}: {
  exchange: ExchangeWithDetails;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (exchange.status !== "COMPLETED" || !canCancel) return null;

  function cancel() {
    setError(null);
    if (!reason.trim()) {
      setError("سبب الإلغاء مطلوب.");
      return;
    }
    startTransition(async () => {
      const result = await cancelExchangeAction({
        exchange_id: exchange.id,
        reason,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("تم إلغاء الاستبدال وعكس حركتي المخزون");
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
        إلغاء الاستبدال
      </Button>

      <Dialog open={open} onOpenChange={isPending ? undefined : setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إلغاء الاستبدال</DialogTitle>
            <DialogDescription className="leading-relaxed">
              سيتم عكس حركتي المخزون معاً: يخرج المنتج المرتجع مرة أخرى ويعود
              المنتج البديل إلى المخزون. لا يتم حذف أي سجل.
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

            {exchange.difference_amount > 0 ? (
              <p className="border-gold/40 bg-gold/10 text-warning-foreground rounded-xl border px-3.5 py-3 text-sm leading-relaxed">
                فرق هذا الاستبدال {formatMoney(exchange.difference_amount)}. بعد
                الإلغاء سيُعكس أثره على حساب العميل.
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="cancel_exchange_reason">
                سبب الإلغاء <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="cancel_exchange_reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="مثال: تم تسجيل الاستبدال بالخطأ."
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
