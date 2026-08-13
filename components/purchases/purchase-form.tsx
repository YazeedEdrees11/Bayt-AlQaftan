"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useIdempotencyKey } from "@/lib/hooks/use-idempotency-key";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  LoaderCircle,
  Paperclip,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductThumb } from "@/components/catalog/product-thumb";
import { VariantPickerDialog } from "./variant-picker-dialog";
import { PaymentStatusBadge } from "./purchase-badges";
import {
  createPurchaseAction,
  getLastCostAction,
  uploadReceiptAction,
} from "@/app/actions/purchases";
import { calculatePurchaseTotals } from "@/lib/validation/purchasing";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { Supplier } from "@/types/catalog";
import type {
  CreatePurchaseResult,
  PurchasableVariant,
  PurchasePaymentMethod,
} from "@/types/purchasing";

interface Line extends PurchasableVariant {
  quantity: string;
  unit_cost: string;
  last_cost: { unit_cost: number; purchase_date: string } | null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function PurchaseForm({
  suppliers,
  defaultSupplierId,
}: {
  suppliers: Pick<Supplier, "id" | "name">[];
  defaultSupplierId?: string;
}) {
  const { key, reset: resetKey } = useIdempotencyKey();
  const router = useRouter();
  const receiptInput = useRef<HTMLInputElement>(null);

  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? "");
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [updateCost, setUpdateCost] = useState(true);

  const [paid, setPaid] = useState("0");
  const [method, setMethod] = useState<PurchasePaymentMethod>("CASH");
  const [bankName, setBankName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreatePurchaseResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const totals = useMemo(
    () => calculatePurchaseTotals(lines, discount, paid),
    [lines, discount, paid],
  );

  function addVariant(variant: PurchasableVariant) {
    setLines((current) => [
      ...current,
      {
        ...variant,
        quantity: "1",
        unit_cost: String(variant.purchase_price ?? 0),
        last_cost: null,
      },
    ]);

    // Fetch what this variant actually cost last time, as a reference.
    void getLastCostAction(variant.variant_id).then((result) => {
      if (!result.ok || !result.data) return;
      setLines((current) =>
        current.map((line) =>
          line.variant_id === variant.variant_id
            ? { ...line, last_cost: result.data ?? null }
            : line,
        ),
      );
    });
  }

  function patchLine(variantId: string, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) =>
        line.variant_id === variantId ? { ...line, ...patch } : line,
      ),
    );
  }

  function removeLine(variantId: string) {
    setLines((current) =>
      current.filter((line) => line.variant_id !== variantId),
    );
  }

  const bankIncomplete =
    totals.paid > 0 &&
    method === "BANK_TRANSFER" &&
    (!bankName.trim() || !transferReference.trim());

  // A draft needs no payment details, so it has a looser bar than completing.
  const canSaveDraft =
    !!supplierId &&
    lines.length > 0 &&
    lines.every(
      (line) => Number(line.quantity) > 0 && Number(line.unit_cost) >= 0,
    );

  const canSubmit =
    !!supplierId &&
    lines.length > 0 &&
    lines.every(
      (line) => Number(line.quantity) > 0 && Number(line.unit_cost) >= 0,
    ) &&
    !totals.overpaid &&
    !bankIncomplete;

  async function submit(status: "DRAFT" | "COMPLETED") {
    setFormError(null);

    let receiptPath: string | null = null;

    // Upload first so the path can be written with the rest of the record.
    if (
      status === "COMPLETED" &&
      receiptFile &&
      method === "BANK_TRANSFER" &&
      totals.paid > 0
    ) {
      const formData = new FormData();
      formData.set("supplier_id", supplierId);
      formData.set("file", receiptFile);
      const uploaded = await uploadReceiptAction(formData);
      if (!uploaded.ok) {
        setFormError(uploaded.error);
        return;
      }
      receiptPath = uploaded.data?.path ?? null;
    }

    const result = await createPurchaseAction({
      supplier_id: supplierId,
      purchase_date: purchaseDate,
      discount,
      notes,
      update_variant_cost: updateCost,
      status,
      items: lines.map((line) => ({
        variant_id: line.variant_id,
        quantity: line.quantity,
        unit_cost: line.unit_cost,
      })),
      payment:
        status === "COMPLETED" && totals.paid > 0
          ? {
              amount: paid,
              payment_method: method,
              payment_date: purchaseDate,
              bank_name: method === "BANK_TRANSFER" ? bankName : "",
              transfer_reference:
                method === "BANK_TRANSFER" ? transferReference : "",
              receipt_image_path: receiptPath ?? "",
              notes: "",
            }
          : null,
    }, key());

    if (!result.ok) {
      setFormError(result.error);
      setConfirmOpen(false);
      return;
    }
    // The operation is done; the next submission from this form is a
    // new one and must not be answered from this one's result.
    resetKey();

    toast.success(
      status === "DRAFT" ? "تم حفظ المسودة" : "تم تسجيل المشتريات بنجاح",
    );
    setSuccess(result.data ?? null);
    setConfirmOpen(false);
    router.refresh();
  }

  /* ------------------------------------------------------------- success */
  if (success) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-5 py-12 text-center">
          <span className="bg-success/10 text-success flex size-16 items-center justify-center rounded-2xl">
            <CheckCircle2 className="size-8" strokeWidth={1.6} />
          </span>

          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold">
              {success.status === "DRAFT"
                ? "تم حفظ المسودة"
                : "تم تسجيل المشتريات بنجاح"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {success.status === "DRAFT"
                ? "لم تتغيّر الكميات ولم يُسجَّل أي مبلغ على حساب المورد. أكمل المسودة عند استلام البضاعة."
                : "تمت إضافة الكميات إلى المخزون وتسجيل العملية على حساب المورد."}
            </p>
          </div>

          <div className="bg-muted/50 grid w-full max-w-md gap-2 rounded-xl p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">رقم المشتريات</span>
              <bdi className="font-semibold">{success.purchase_number}</bdi>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الإجمالي</span>
              <span className="font-medium">
                {formatMoney(success.total_amount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">المدفوع</span>
              <span className="text-success font-medium">
                {formatMoney(success.paid_amount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">المتبقي</span>
              <span
                className={cn(
                  "font-medium",
                  Number(success.remaining_amount) > 0 && "text-destructive",
                )}
              >
                {formatMoney(success.remaining_amount)}
              </span>
            </div>
            <Separator className="my-1" />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">حالة الدفع</span>
              <PaymentStatusBadge status={success.payment_status} />
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={`/purchases/${success.id}`}>عرض المشتريات</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSuccess(null);
                setLines([]);
                setDiscount("0");
                setPaid("0");
                setNotes("");
                setBankName("");
                setTransferReference("");
                setReceiptFile(null);
                setMethod("CASH");
              }}
            >
              إضافة مشتريات جديدة
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  /* ---------------------------------------------------------------- form */
  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      {formError ? (
        <div
          role="alert"
          className="border-destructive/25 bg-destructive/8 text-destructive flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="leading-relaxed">{formError}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>بيانات المشتريات</CardTitle>
          <CardDescription>المورد وتاريخ استلام البضاعة.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="supplier">
              المورد <span className="text-destructive">*</span>
            </Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="supplier" className="h-11 w-full">
                <SelectValue placeholder="اختر المورد" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suppliers.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                لا يوجد موردون مفعّلون.{" "}
                <Link href="/suppliers" className="text-primary underline">
                  أضف مورداً أولاً
                </Link>
                .
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchase_date">
              تاريخ المشتريات <span className="text-destructive">*</span>
            </Label>
            <Input
              id="purchase_date"
              type="date"
              className="h-11"
              value={purchaseDate}
              onChange={(event) => setPurchaseDate(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ items */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>المنتجات</CardTitle>
            <CardDescription>
              ابحث واختر الموديلات المستلمة ثم أدخل الكمية وسعر الشراء.
            </CardDescription>
          </div>
          <Button type="button" onClick={() => setPickerOpen(true)}>
            <Plus className="size-4" />
            إضافة منتج
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {lines.length === 0 ? (
            <EmptyState
              compact
              title="لم تتم إضافة منتجات"
              description="اضغط «إضافة منتج» لاختيار الموديلات المستلمة."
            />
          ) : (
            lines.map((line) => {
              const lineTotal =
                (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0);

              return (
                <div
                  key={line.variant_id}
                  className="border-border/70 bg-muted/20 rounded-xl border p-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <ProductThumb
                        url={line.image_url}
                        alt={line.product_name}
                        className="size-12"
                      />
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate font-medium">
                          {line.product_name}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          <bdi>{line.sku}</bdi>
                          {line.color ? ` · ${line.color}` : ""}
                          {line.size ? ` · ${line.size}` : ""}
                          {` · المخزون الحالي ${formatNumber(line.current_stock)}`}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-auto">
                      <div className="space-y-1">
                        <Label className="text-xs">الكمية</Label>
                        <Input
                          inputMode="numeric"
                          dir="ltr"
                          className="h-10 w-full text-left sm:w-24"
                          value={line.quantity}
                          onChange={(event) =>
                            patchLine(line.variant_id, {
                              quantity: event.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">سعر الشراء</Label>
                        <Input
                          inputMode="decimal"
                          dir="ltr"
                          className="h-10 w-full text-left sm:w-28"
                          value={line.unit_cost}
                          onChange={(event) =>
                            patchLine(line.variant_id, {
                              unit_cost: event.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">الإجمالي</Label>
                        <div className="border-border/70 bg-card flex h-10 items-center rounded-md border px-3 text-sm font-medium">
                          {formatMoney(lineTotal)}
                        </div>
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive h-10"
                          onClick={() => removeLine(line.variant_id)}
                          aria-label={`حذف ${line.sku}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {line.last_cost ? (
                    <p className="text-muted-foreground mt-2 text-xs">
                      آخر سعر شراء: {formatMoney(line.last_cost.unit_cost)} بتاريخ{" "}
                      {formatDate(line.last_cost.purchase_date)}
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>الدفع</CardTitle>
            <CardDescription>
              يدعم النظام الدفع النقدي والتحويل البنكي فقط.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMethod("CASH")}
                className={cn(
                  "rounded-xl border p-4 text-start transition-colors",
                  method === "CASH"
                    ? "border-primary bg-accent"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <p className="font-medium">نقدي</p>
                <p className="text-muted-foreground text-xs">
                  دفع مباشر من الصندوق.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMethod("BANK_TRANSFER")}
                className={cn(
                  "rounded-xl border p-4 text-start transition-colors",
                  method === "BANK_TRANSFER"
                    ? "border-primary bg-accent"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <p className="font-medium">تحويل بنكي</p>
                <p className="text-muted-foreground text-xs">
                  يتطلب اسم البنك ورقم التحويل.
                </p>
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="paid">المبلغ المدفوع</Label>
                <Input
                  id="paid"
                  inputMode="decimal"
                  dir="ltr"
                  className={cn(
                    "h-11 text-left",
                    totals.overpaid && "border-destructive",
                  )}
                  value={paid}
                  onChange={(event) => setPaid(event.target.value)}
                />
                {totals.overpaid ? (
                  <p className="text-destructive text-xs">
                    المبلغ المدفوع لا يمكن أن يكون أكبر من الإجمالي.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    اتركه صفراً إذا لم يُدفع شيء الآن.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="discount">الخصم</Label>
                <Input
                  id="discount"
                  inputMode="decimal"
                  dir="ltr"
                  className="h-11 text-left"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                />
              </div>
            </div>

            {method === "BANK_TRANSFER" && totals.paid > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bank_name">
                    البنك <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="bank_name"
                    className="h-11"
                    placeholder="مثال: البنك العربي"
                    value={bankName}
                    onChange={(event) => setBankName(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transfer_reference">
                    رقم التحويل <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="transfer_reference"
                    dir="ltr"
                    className="h-11 text-left"
                    placeholder="TRX-000000"
                    value={transferReference}
                    onChange={(event) =>
                      setTransferReference(event.target.value)
                    }
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>إيصال التحويل</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => receiptInput.current?.click()}
                    >
                      <Paperclip className="size-4" />
                      رفع الإيصال
                    </Button>
                    {receiptFile ? (
                      <span className="text-muted-foreground flex items-center gap-2 text-sm">
                        <bdi className="truncate">{receiptFile.name}</bdi>
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
                        JPG، PNG، WEBP أو PDF · حتى 10 ميجابايت
                      </span>
                    )}
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
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="ملاحظات على هذه الفاتورة."
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="update_cost">
                  تحديث سعر الشراء الافتراضي للموديلات
                </Label>
                <p className="text-muted-foreground text-xs">
                  يحدّث السعر الحالي فقط. أسعار المشتريات السابقة لا تتغير أبداً.
                </p>
              </div>
              <Switch
                id="update_cost"
                checked={updateCost}
                onCheckedChange={setUpdateCost}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle>الملخص</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="المجموع الفرعي" value={formatMoney(totals.subtotal)} />
            <Row label="الخصم" value={`− ${formatMoney(totals.discount)}`} />
            <Separator />
            <div className="flex items-center justify-between">
              <span className="font-medium">الإجمالي</span>
              <span className="text-lg font-semibold">
                {formatMoney(totals.total)}
              </span>
            </div>
            <Row
              label="المدفوع"
              value={formatMoney(totals.paid)}
              tone="positive"
            />
            <Row
              label="المتبقي"
              value={formatMoney(totals.remaining)}
              tone={totals.remaining > 0 ? "negative" : undefined}
            />
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">حالة الدفع</span>
              <PaymentStatusBadge status={totals.paymentStatus} />
            </div>

            {bankIncomplete ? (
              <p className="text-destructive pt-1 text-xs">
                بيانات التحويل البنكي غير مكتملة.
              </p>
            ) : null}

            <Button
              type="button"
              size="lg"
              className="mt-2 w-full"
              disabled={!canSubmit || isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                "حفظ المشتريات"
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!canSaveDraft || isPending}
              onClick={() => {
                setSavingDraft(true);
                startTransition(async () => {
                  await submit("DRAFT");
                  setSavingDraft(false);
                });
              }}
            >
              {savingDraft ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <FileText className="size-4" />
                  حفظ كمسودة
                </>
              )}
            </Button>

            <p className="text-muted-foreground text-xs leading-relaxed">
              المسودة تحفظ الفاتورة دون تغيير المخزون أو حساب المورد.
            </p>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => router.push("/purchases")}
              disabled={isPending}
            >
              إلغاء
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Below lg the summary card is not sticky and ends up far down the
          page, so the running total and the primary action follow the user
          instead. Hidden on desktop, where the sidebar summary already does
          this job. */}
      <div className="bg-card/95 border-border/70 fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 shadow-[0_-4px_16px_-8px_oklch(0_0_0/0.15)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">الإجمالي</p>
            <p className="truncate text-lg font-semibold">
              {formatMoney(totals.total)}
              {totals.remaining > 0 ? (
                <span className="text-destructive ms-2 text-xs font-normal">
                  متبقٍ {formatMoney(totals.remaining)}
                </span>
              ) : null}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={!canSaveDraft || isPending}
            onClick={() => {
              setSavingDraft(true);
              startTransition(async () => {
                await submit("DRAFT");
                setSavingDraft(false);
              });
            }}
          >
            <FileText className="size-4" />
            مسودة
          </Button>

          <Button
            type="button"
            className="shrink-0"
            disabled={!canSubmit || isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {isPending && !savingDraft ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : null}
            حفظ المشتريات
          </Button>
        </div>
      </div>

      <VariantPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={addVariant}
        excludeIds={lines.map((line) => line.variant_id)}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="تأكيد حفظ المشتريات؟"
        description="سيتم إضافة الكميات إلى المخزون وتسجيل العملية على حساب المورد."
        confirmLabel="تأكيد وحفظ"
        onConfirm={() => {
          startTransition(async () => {
            await submit("COMPLETED");
          });
        }}
      />
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}
