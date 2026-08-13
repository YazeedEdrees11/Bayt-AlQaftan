"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Paperclip, TriangleAlert, X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  completePurchaseAction,
  uploadReceiptAction,
} from "@/app/actions/purchases";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { PurchasePaymentMethod } from "@/types/purchasing";

/**
 * Turns a draft into a received purchase.
 *
 * This is the point where the goods are treated as in the shop: stock rises,
 * the supplier is charged, and any payment made on the spot is recorded.
 * Leaving the amount at zero is normal — it just means nothing was paid yet.
 */
export function CompleteDraftDialog({
  open,
  onOpenChange,
  purchaseId,
  supplierId,
  purchaseNumber,
  total,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseId: string;
  supplierId: string;
  purchaseNumber: string;
  total: number;
}) {
  const router = useRouter();
  const receiptInput = useRef<HTMLInputElement>(null);

  const [amount, setAmount] = useState("0");
  const [method, setMethod] = useState<PurchasePaymentMethod>("CASH");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [bankName, setBankName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [updateCost, setUpdateCost] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const amountValue = Number(amount) || 0;
  const overpaid = amountValue > total;
  const bankIncomplete =
    amountValue > 0 &&
    method === "BANK_TRANSFER" &&
    (!bankName.trim() || !transferReference.trim());

  function submit() {
    setFormError(null);

    if (overpaid) {
      setFormError("المبلغ المدفوع لا يمكن أن يكون أكبر من الإجمالي.");
      return;
    }
    if (bankIncomplete) {
      setFormError("بيانات التحويل البنكي غير مكتملة.");
      return;
    }

    startTransition(async () => {
      let receiptPath = "";

      if (receiptFile && method === "BANK_TRANSFER" && amountValue > 0) {
        const formData = new FormData();
        formData.set("supplier_id", supplierId);
        formData.set("file", receiptFile);
        const uploaded = await uploadReceiptAction(formData);
        if (!uploaded.ok) {
          setFormError(uploaded.error);
          return;
        }
        receiptPath = uploaded.data?.path ?? "";
      }

      const result = await completePurchaseAction({
        purchase_id: purchaseId,
        update_variant_cost: updateCost,
        payment:
          amountValue > 0
            ? {
                amount,
                payment_method: method,
                payment_date: paymentDate,
                bank_name: method === "BANK_TRANSFER" ? bankName : "",
                transfer_reference:
                  method === "BANK_TRANSFER" ? transferReference : "",
                receipt_image_path: receiptPath,
                notes: "",
              }
            : null,
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success("تم إكمال المشتريات وإضافة الكميات إلى المخزون");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>إكمال المشتريات</DialogTitle>
          <DialogDescription className="leading-relaxed">
            <bdi>{purchaseNumber}</bdi> · الإجمالي {formatMoney(total)}
            <br />
            سيتم إضافة الكميات إلى المخزون وتسجيل المبلغ على حساب المورد.
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="complete_amount">المبلغ المدفوع الآن</Label>
              <Input
                id="complete_amount"
                inputMode="decimal"
                dir="ltr"
                className={cn("h-11 text-left", overpaid && "border-destructive")}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={isPending}
              />
              <p
                className={cn(
                  "text-xs",
                  overpaid ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {overpaid
                  ? "المبلغ المدفوع لا يمكن أن يكون أكبر من الإجمالي."
                  : "اتركه صفراً إذا لم يُدفع شيء الآن."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="complete_date">تاريخ الدفعة</Label>
              <Input
                id="complete_date"
                type="date"
                className="h-11"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                disabled={isPending || amountValue <= 0}
              />
            </div>

            {amountValue > 0 ? (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="complete_method">طريقة الدفع</Label>
                  <Select
                    value={method}
                    onValueChange={(value) =>
                      setMethod(value as PurchasePaymentMethod)
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger id="complete_method" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">نقدي</SelectItem>
                      <SelectItem value="BANK_TRANSFER">تحويل بنكي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {method === "BANK_TRANSFER" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="complete_bank">
                        البنك <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="complete_bank"
                        className="h-11"
                        value={bankName}
                        onChange={(event) => setBankName(event.target.value)}
                        disabled={isPending}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="complete_ref">
                        رقم التحويل <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="complete_ref"
                        dir="ltr"
                        className="h-11 text-left"
                        value={transferReference}
                        onChange={(event) =>
                          setTransferReference(event.target.value)
                        }
                        disabled={isPending}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>إيصال التحويل</Label>
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
                            <bdi className="max-w-[12rem] truncate">
                              {receiptFile.name}
                            </bdi>
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
                        ) : null}
                      </div>
                      <input
                        ref={receiptInput}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(event) => {
                          setReceiptFile(event.target.files?.[0] ?? null);
                          event.target.value = "";
                        }}
                      />
                    </div>
                  </>
                ) : null}
              </>
            ) : null}

            <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3 sm:col-span-2">
              <div className="space-y-0.5">
                <Label htmlFor="complete_update_cost">
                  تحديث سعر الشراء الافتراضي
                </Label>
                <p className="text-muted-foreground text-xs">
                  أسعار المشتريات السابقة لا تتغير.
                </p>
              </div>
              <Switch
                id="complete_update_cost"
                checked={updateCost}
                onCheckedChange={setUpdateCost}
                disabled={isPending}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={isPending || overpaid || bankIncomplete}
          >
            {isPending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                جاري الإكمال...
              </>
            ) : (
              "تأكيد الإكمال"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
