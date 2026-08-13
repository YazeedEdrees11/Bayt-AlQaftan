"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, PackageX } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { recordDamageAction } from "@/app/actions/returns";
import { formatNumber } from "@/lib/utils/format";

/**
 * Moves sellable units into the damaged bucket.
 *
 * Two ledger movements in one transaction — out of available, into damaged —
 * so the goods stay counted. Nothing is ever quietly deleted from stock.
 */
export function DamageDialog({
  variantId,
  sku,
  availableQuantity,
}: {
  variantId: string;
  sku: string;
  availableQuantity: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const value = Number(quantity);
    if (!Number.isInteger(value) || value <= 0) {
      setError("الكمية يجب أن تكون رقماً صحيحاً أكبر من صفر.");
      return;
    }
    if (value > availableQuantity) {
      setError("المنتج غير متوفر بالكمية المطلوبة.");
      return;
    }

    startTransition(async () => {
      const result = await recordDamageAction({
        variant_id: variantId,
        quantity: String(value),
        notes: notes.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("تم تسجيل الكمية التالفة");
      setOpen(false);
      setQuantity("1");
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
        disabled={availableQuantity <= 0}
      >
        <PackageX className="size-4" />
        تسجيل تالف
      </Button>

      <Dialog open={open} onOpenChange={isPending ? undefined : setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تسجيل كمية تالفة</DialogTitle>
            <DialogDescription className="leading-relaxed">
              ستُخصم الكمية من المخزون المتاح وتُضاف إلى المخزون التالف. الكمية
              تبقى محسوبة في السجل ولا يمكن بيعها.
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

            <div className="space-y-2">
              <Label htmlFor="damage_quantity">
                الكمية التالفة{" "}
                <span className="text-muted-foreground text-xs">
                  (المتاح {formatNumber(availableQuantity)} — <bdi>{sku}</bdi>)
                </span>
              </Label>
              <Input
                id="damage_quantity"
                inputMode="numeric"
                dir="ltr"
                className="h-11 text-left"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="damage_notes">الملاحظات</Label>
              <Textarea
                id="damage_notes"
                rows={3}
                value={notes}
                placeholder="مثال: تمزق أثناء العرض."
                onChange={(event) => setNotes(event.target.value)}
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
              onClick={submit}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                "تأكيد"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
