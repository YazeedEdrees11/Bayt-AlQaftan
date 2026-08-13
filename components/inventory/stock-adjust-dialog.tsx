"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Minus, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adjustStockAction } from "@/app/actions/inventory";
import { formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type Direction = "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";

/**
 * Stock adjustment.
 *
 * There is no "set stock to N" — a movement plus a reason is the only way the
 * balance changes, so the ledger always explains itself. Over-withdrawal is
 * blocked here for a fast message and again by the database.
 */
export function StockAdjustDialog({
  variantId,
  sku,
  currentStock,
}: {
  variantId: string;
  sku: string;
  currentStock: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("ADJUSTMENT_IN");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parsedQuantity = Number(quantity);
  const validQuantity =
    quantity !== "" && Number.isInteger(parsedQuantity) && parsedQuantity > 0;

  const wouldGoNegative =
    direction === "ADJUSTMENT_OUT" &&
    validQuantity &&
    parsedQuantity > currentStock;

  const projected = validQuantity
    ? direction === "ADJUSTMENT_IN"
      ? currentStock + parsedQuantity
      : currentStock - parsedQuantity
    : currentStock;

  function reset() {
    setDirection("ADJUSTMENT_IN");
    setQuantity("");
    setNotes("");
    setFormError(null);
  }

  function submit() {
    setFormError(null);

    if (!validQuantity) {
      setFormError("الكمية يجب أن تكون رقماً صحيحاً أكبر من صفر.");
      return;
    }
    if (!notes.trim()) {
      setFormError("السبب مطلوب.");
      return;
    }
    if (wouldGoNegative) {
      setFormError("لا يمكن خصم كمية أكبر من المخزون الحالي.");
      return;
    }

    startTransition(async () => {
      const result = await adjustStockAction({
        variant_id: variantId,
        transaction_type: direction,
        quantity: parsedQuantity,
        notes: notes.trim(),
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(
        direction === "ADJUSTMENT_IN"
          ? "تمت إضافة الكمية إلى المخزون"
          : "تم خصم الكمية من المخزون",
      );
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>تعديل المخزون</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل المخزون</DialogTitle>
          <DialogDescription>
            <bdi>{sku}</bdi> · المخزون الحالي:{" "}
            <span className="font-medium">{formatNumber(currentStock)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {formError ? (
            <div
              role="alert"
              className="border-destructive/25 bg-destructive/8 text-destructive flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span className="leading-relaxed">{formError}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={direction === "ADJUSTMENT_IN" ? "default" : "outline"}
              className="h-11"
              onClick={() => setDirection("ADJUSTMENT_IN")}
              disabled={isPending}
            >
              <Plus className="size-4" />
              إضافة كمية
            </Button>
            <Button
              type="button"
              variant={direction === "ADJUSTMENT_OUT" ? "default" : "outline"}
              className="h-11"
              onClick={() => setDirection("ADJUSTMENT_OUT")}
              disabled={isPending}
            >
              <Minus className="size-4" />
              خصم كمية
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">
              الكمية <span className="text-destructive">*</span>
            </Label>
            <Input
              id="quantity"
              inputMode="numeric"
              dir="ltr"
              className={cn(
                "h-11 text-left",
                wouldGoNegative && "border-destructive",
              )}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="0"
              disabled={isPending}
            />
            {wouldGoNegative ? (
              <p className="text-destructive text-xs">
                لا يمكن خصم كمية أكبر من المخزون الحالي.
              </p>
            ) : validQuantity ? (
              <p className="text-muted-foreground text-xs">
                المخزون بعد التعديل:{" "}
                <span className="font-medium">{formatNumber(projected)}</span>
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">
              السبب <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={
                direction === "ADJUSTMENT_IN" ? "جرد المخزون" : "قطعة تالفة"
              }
              disabled={isPending}
            />
            <p className="text-muted-foreground text-xs">
              يُحفظ السبب في سجل حركة المخزون ولا يمكن تعديله لاحقاً.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={isPending || wouldGoNegative}
          >
            {isPending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              "تسجيل الحركة"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
