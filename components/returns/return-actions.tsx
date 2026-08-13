"use client";

import { useRef, useState, useTransition } from "react";
import { useIdempotencyKey } from "@/lib/hooks/use-idempotency-key";
import { useRouter } from "next/navigation";
import { Ban, LoaderCircle, Paperclip, Wallet, X } from "lucide-react";
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
import { REFUND_RECEIPT_ACCEPT } from "./refund-accept";
import {
  addRefundAction,
  cancelReturnAction,
  uploadRefundReceiptAction,
} from "@/app/actions/returns";
import { formatMoney } from "@/lib/utils/format";
import {
  REFUND_METHODS,
  REFUND_METHOD_LABELS,
  type RefundMethod,
} from "@/types/returns";
import type { ReturnWithDetails } from "@/types/returns";

export function ReturnActions({
  salesReturn,
  canRefund,
  canCancel,
}: {
  salesReturn: ReturnWithDetails;
  canRefund: boolean;
  canCancel: boolean;
}) {
  const { key, reset: resetKey } = useIdempotencyKey();
  const router = useRouter();
  const [refundOpen, setRefundOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [method, setMethod] = useState<RefundMethod>("CASH");
  const [amount, setAmount] = useState(String(salesReturn.outstanding_refund));
  const [bankName, setBankName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const receiptInput = useRef<HTMLInputElement>(null);
  const [refundError, setRefundError] = useState<string | null>(null);

  const [reason, setReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isCompleted = salesReturn.status === "COMPLETED";
  const owes = salesReturn.outstanding_refund > 0;
  const creditWithoutCustomer =
    method === "CUSTOMER_CREDIT" && !salesReturn.customer_id;

  function submitRefund() {
    setRefundError(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setRefundError("أدخل مبلغاً صحيحاً أكبر من صفر.");
      return;
    }
    if (value > salesReturn.outstanding_refund) {
      setRefundError("المبلغ المسترد أكبر من قيمة المرتجع.");
      return;
    }
    if (creditWithoutCustomer) {
      setRefundError("لا يمكن إضافة رصيد لعميل غير مسجل.");
      return;
    }
    if (method === "BANK_TRANSFER" && (!bankName.trim() || !transferReference.trim())) {
      setRefundError("بيانات التحويل البنكي غير مكتملة.");
      return;
    }

    startTransition(async () => {
      let receiptPath = "";
      if (receiptFile && method === "BANK_TRANSFER") {
        const formData = new FormData();
        formData.set("key", salesReturn.customer_id ?? "walkin");
        formData.set("file", receiptFile);
        const uploaded = await uploadRefundReceiptAction(formData);
        if (!uploaded.ok) {
          setRefundError(uploaded.error);
          return;
        }
        receiptPath = uploaded.data?.path ?? "";
      }

      const result = await addRefundAction({
        return_id: salesReturn.id,
        refund_method: method,
        amount: String(value),
        bank_name: bankName.trim() || undefined,
        transfer_reference: transferReference.trim() || undefined,
        receipt_image_path: receiptPath || undefined,
      }, key());

      if (!result.ok) {
        setRefundError(result.error);
        return;
      }
    // The operation is done; the next submission from this form is a
    // new one and must not be answered from this one's result.
    resetKey();
      toast.success("تم تسجيل الاسترداد");
      setRefundOpen(false);
      setReceiptFile(null);
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
      const result = await cancelReturnAction({
        return_id: salesReturn.id,
        reason,
      });
      if (!result.ok) {
        setCancelError(result.error);
        return;
      }
      toast.success("تم إلغاء المرتجع وسحب الكميات من المخزون");
      setCancelOpen(false);
      router.refresh();
    });
  }

  if (!isCompleted) return null;

  return (
    <>
      {canRefund && owes ? (
        <Button onClick={() => setRefundOpen(true)}>
          <Wallet className="size-4" />
          تسجيل استرداد
        </Button>
      ) : null}

      {canCancel ? (
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setCancelOpen(true)}
        >
          <Ban className="size-4" />
          إلغاء المرتجع
        </Button>
      ) : null}

      {/* ------------------------------------------------------------ refund */}
      <Dialog open={refundOpen} onOpenChange={isPending ? undefined : setRefundOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تسجيل استرداد</DialogTitle>
            <DialogDescription>
              المتبقي من قيمة المرتجع: {formatMoney(salesReturn.outstanding_refund)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {refundError ? (
              <p
                role="alert"
                className="border-destructive/25 bg-destructive/8 text-destructive rounded-xl border px-3.5 py-3 text-sm leading-relaxed"
              >
                {refundError}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="refund_amount">المبلغ</Label>
                <Input
                  id="refund_amount"
                  inputMode="decimal"
                  dir="ltr"
                  className="h-11 text-left"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="refund_method">الطريقة</Label>
                <Select
                  value={method}
                  onValueChange={(value) => setMethod(value as RefundMethod)}
                  disabled={isPending}
                >
                  <SelectTrigger id="refund_method" className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFUND_METHODS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {REFUND_METHOD_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {method === "BANK_TRANSFER" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="refund_bank">اسم البنك</Label>
                    <Input
                      id="refund_bank"
                      className="h-11"
                      placeholder="البنك العربي"
                      value={bankName}
                      onChange={(event) => setBankName(event.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="refund_ref">رقم التحويل</Label>
                    <Input
                      id="refund_ref"
                      dir="ltr"
                      className="h-11 text-left"
                      placeholder="REF-000000"
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
                          <bdi className="max-w-[12rem] truncate">{receiptFile.name}</bdi>
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
                          اختياري · JPG، PNG أو WEBP
                        </span>
                      )}
                    </div>
                    <input
                      ref={receiptInput}
                      type="file"
                      accept={REFUND_RECEIPT_ACCEPT}
                      className="hidden"
                      onChange={(event) =>
                        setReceiptFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </div>
                </>
              ) : null}
            </div>

            {creditWithoutCustomer ? (
              <p className="text-destructive text-xs">
                لا يمكن إضافة رصيد لعميل غير مسجل.
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRefundOpen(false)}
              disabled={isPending}
            >
              تراجع
            </Button>
            <Button type="button" onClick={submitRefund} disabled={isPending}>
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                "تسجيل الاسترداد"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------ cancel */}
      <Dialog open={cancelOpen} onOpenChange={isPending ? undefined : setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إلغاء المرتجع</DialogTitle>
            <DialogDescription className="leading-relaxed">
              سيتم سحب الكميات من المخزون مرة أخرى وعكس الأثر المالي. لا يتم حذف
              أي سجل — تبقى الحركات الأصلية كما هي.
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

            {salesReturn.refunded_amount > 0 ? (
              <p className="border-gold/40 bg-gold/10 text-warning-foreground rounded-xl border px-3.5 py-3 text-sm leading-relaxed">
                تم استرداد {formatMoney(salesReturn.refunded_amount)} على هذا
                المرتجع. بعد الإلغاء سيُعاد قيد المبلغ على حساب العميل.
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="cancel_return_reason">
                سبب الإلغاء <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="cancel_return_reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="مثال: تم تسجيل المرتجع بالخطأ."
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
