"use client";

import { useRef, useState, useTransition } from "react";
import { useIdempotencyKey } from "@/lib/hooks/use-idempotency-key";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addSalePaymentAction,
  uploadSaleReceiptAction,
} from "@/app/actions/sales";
import { RECEIPT_ACCEPT } from "./receipt-accept";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { SalePaymentMethod } from "@/types/sales";

export interface PayableSale {
  id: string;
  sale_number: string;
  remaining_amount: number;
}

/**
 * Collects money from a customer against a specific sale.
 *
 * The amount is capped at what that sale still owes — anything above it has no
 * meaning until customer credit exists as a feature, and the RPC rejects it.
 */
export function SalePaymentDialog({
  open,
  onOpenChange,
  sales,
  defaultSaleId,
  receiptKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Completed sales that still owe money. */
  sales: PayableSale[];
  defaultSaleId?: string;
  /** Folder key used when storing an uploaded receipt. */
  receiptKey: string;
}) {
  const { key, reset: resetKey } = useIdempotencyKey();
  const router = useRouter();
  const receiptInput = useRef<HTMLInputElement>(null);

  const [saleId, setSaleId] = useState(defaultSaleId ?? sales[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<SalePaymentMethod>("CASH");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [bankName, setBankName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = sales.find((sale) => sale.id === saleId);
  const outstanding = Number(selected?.remaining_amount ?? 0);
  const amountValue = Number(amount) || 0;
  const exceeds = amountValue > outstanding;

  function submit() {
    setFormError(null);

    if (!saleId) {
      setFormError("اختر عملية البيع التي تريد تسجيل الدفعة عليها.");
      return;
    }
    if (amountValue <= 0) {
      setFormError("المبلغ يجب أن يكون أكبر من صفر.");
      return;
    }
    if (exceeds) {
      setFormError("المبلغ المدفوع أكبر من الرصيد المستحق.");
      return;
    }
    if (method === "BANK_TRANSFER" && (!bankName.trim() || !transferReference.trim())) {
      setFormError("بيانات التحويل البنكي غير مكتملة.");
      return;
    }

    startTransition(async () => {
      let receiptPath = "";

      if (receiptFile && method === "BANK_TRANSFER") {
        const formData = new FormData();
        formData.set("key", receiptKey);
        formData.set("file", receiptFile);
        const uploaded = await uploadSaleReceiptAction(formData);
        if (!uploaded.ok) {
          setFormError(uploaded.error);
          return;
        }
        receiptPath = uploaded.data?.path ?? "";
      }

      const result = await addSalePaymentAction({
        sale_id: saleId,
        amount,
        payment_method: method,
        payment_date: paymentDate,
        bank_name: method === "BANK_TRANSFER" ? bankName : "",
        transfer_reference: method === "BANK_TRANSFER" ? transferReference : "",
        receipt_image_path: receiptPath,
        notes,
      }, key());

      if (!result.ok) {
        setFormError(result.error);
        return;
      }
    // The operation is done; the next submission from this form is a
    // new one and must not be answered from this one's result.
    resetKey();

      toast.success("تم تسجيل الدفعة بنجاح");
      onOpenChange(false);
      setAmount("");
      setBankName("");
      setTransferReference("");
      setNotes("");
      setReceiptFile(null);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>تسجيل دفعة</DialogTitle>
          <DialogDescription>
            دفعة من العميل مقابل عملية بيع محددة.
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

          {sales.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              لا توجد عمليات بيع مستحقة لهذا العميل.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sale">عملية البيع</Label>
                <Select value={saleId} onValueChange={setSaleId}>
                  <SelectTrigger id="sale" className="h-11 w-full">
                    <SelectValue placeholder="اختر عملية البيع" />
                  </SelectTrigger>
                  <SelectContent>
                    {sales.map((sale) => (
                      <SelectItem key={sale.id} value={sale.id}>
                        {sale.sale_number} — المستحق{" "}
                        {formatMoney(sale.remaining_amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pay_amount">
                  المبلغ <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="pay_amount"
                  inputMode="decimal"
                  dir="ltr"
                  className={cn("h-11 text-left", exceeds && "border-destructive")}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  disabled={isPending}
                />
                <p
                  className={cn(
                    "text-xs",
                    exceeds ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {exceeds
                    ? "المبلغ المدفوع أكبر من الرصيد المستحق."
                    : `المستحق على هذه العملية: ${formatMoney(outstanding)}`}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pay_date">التاريخ</Label>
                <Input
                  id="pay_date"
                  type="date"
                  className="h-11"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pay_method">طريقة الدفع</Label>
                <Select
                  value={method}
                  onValueChange={(value) => setMethod(value as SalePaymentMethod)}
                  disabled={isPending}
                >
                  <SelectTrigger id="pay_method" className="h-11 w-full">
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
                    <Label htmlFor="pay_bank">
                      البنك <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="pay_bank"
                      className="h-11"
                      placeholder="البنك العربي"
                      value={bankName}
                      onChange={(event) => setBankName(event.target.value)}
                      disabled={isPending}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pay_ref">
                      رقم التحويل <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="pay_ref"
                      dir="ltr"
                      className="h-11 text-left"
                      placeholder="TRX-000000"
                      value={transferReference}
                      onChange={(event) => setTransferReference(event.target.value)}
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
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          اختياري · JPG، PNG، WEBP أو PDF
                        </span>
                      )}
                    </div>
                    <input
                      ref={receiptInput}
                      type="file"
                      accept={RECEIPT_ACCEPT}
                      className="hidden"
                      onChange={(event) => {
                        setReceiptFile(event.target.files?.[0] ?? null);
                        event.target.value = "";
                      }}
                    />
                  </div>
                </>
              ) : null}

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pay_notes">ملاحظات</Label>
                <Textarea
                  id="pay_notes"
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>
          )}
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
            disabled={isPending || sales.length === 0 || exceeds}
          >
            {isPending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              "تسجيل الدفعة"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
