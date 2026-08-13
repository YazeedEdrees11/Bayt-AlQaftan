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
  UserPlus,
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductThumb } from "@/components/catalog/product-thumb";
import { SaleVariantPicker } from "./sale-variant-picker";
import { SalePaymentStatusBadge } from "./sale-badges";
import { RECEIPT_ACCEPT } from "./receipt-accept";
import { CustomerDialog } from "@/components/customers/customer-dialog";
import { createSaleAction, uploadSaleReceiptAction } from "@/app/actions/sales";
import { calculateSaleTotals } from "@/lib/validation/sales";
import { formatMoney, formatNumber, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { Customer, CreateSaleResult, SalePaymentMethod, SellableVariant } from "@/types/sales";

const WALK_IN = "__walkin__";

interface Line extends SellableVariant {
  quantity: string;
  unit_price: string;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function SaleForm({
  customers,
  defaultCustomerId,
  canSeeProfit,
  canCreateCustomer,
}: {
  customers: Pick<Customer, "id" | "customer_number" | "name" | "phone">[];
  defaultCustomerId?: string;
  canSeeProfit: boolean;
  canCreateCustomer: boolean;
}) {
  const { key, reset: resetKey } = useIdempotencyKey();
  const router = useRouter();
  const receiptInput = useRef<HTMLInputElement>(null);

  const [customerList, setCustomerList] = useState(customers);
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? WALK_IN);
  const [saleDate, setSaleDate] = useState(today());
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");

  const [paid, setPaid] = useState("0");
  const [method, setMethod] = useState<SalePaymentMethod>("CASH");
  const [bankName, setBankName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateSaleResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const totals = useMemo(
    () =>
      calculateSaleTotals(
        lines.map((line) => ({
          quantity: line.quantity,
          unit_price: line.unit_price,
          unit_cost: line.purchase_price,
        })),
        discount,
        paid,
      ),
    [lines, discount, paid],
  );

  const inBasket = useMemo(
    () =>
      Object.fromEntries(
        lines.map((line) => [line.variant_id, Number(line.quantity) || 0]),
      ),
    [lines],
  );

  /** Adding an existing variant bumps its quantity instead of duplicating it. */
  function addVariant(variant: SellableVariant) {
    setLines((current) => {
      const existing = current.find((l) => l.variant_id === variant.variant_id);
      if (existing) {
        return current.map((line) =>
          line.variant_id === variant.variant_id
            ? { ...line, quantity: String((Number(line.quantity) || 0) + 1) }
            : line,
        );
      }
      return [
        ...current,
        {
          ...variant,
          quantity: "1",
          unit_price: String(variant.selling_price ?? 0),
        },
      ];
    });
  }

  function patchLine(variantId: string, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) =>
        line.variant_id === variantId ? { ...line, ...patch } : line,
      ),
    );
  }

  const overStocked = lines.filter(
    (line) => (Number(line.quantity) || 0) > line.current_stock,
  );

  const bankIncomplete =
    totals.paid > 0 &&
    method === "BANK_TRANSFER" &&
    (!bankName.trim() || !transferReference.trim());

  const canSaveDraft =
    lines.length > 0 &&
    lines.every((line) => Number(line.quantity) > 0 && Number(line.unit_price) >= 0);

  const canSubmit =
    canSaveDraft && overStocked.length === 0 && !totals.overpaid && !bankIncomplete;

  async function submit(status: "DRAFT" | "COMPLETED") {
    setFormError(null);
    let receiptPath = "";

    if (
      status === "COMPLETED" &&
      receiptFile &&
      method === "BANK_TRANSFER" &&
      totals.paid > 0
    ) {
      const formData = new FormData();
      formData.set("key", customerId === WALK_IN ? "walkin" : customerId);
      formData.set("file", receiptFile);
      const uploaded = await uploadSaleReceiptAction(formData);
      if (!uploaded.ok) {
        setFormError(uploaded.error);
        return;
      }
      receiptPath = uploaded.data?.path ?? "";
    }

    const result = await createSaleAction({
      customer_id: customerId === WALK_IN ? null : customerId,
      sale_date: saleDate,
      discount,
      notes,
      status,
      items: lines.map((line) => ({
        variant_id: line.variant_id,
        quantity: line.quantity,
        unit_price: line.unit_price,
      })),
      payments:
        status === "COMPLETED" && totals.paid > 0
          ? [
              {
                amount: paid,
                payment_method: method,
                payment_date: saleDate,
                bank_name: method === "BANK_TRANSFER" ? bankName : "",
                transfer_reference:
                  method === "BANK_TRANSFER" ? transferReference : "",
                receipt_image_path: receiptPath,
                notes: "",
              },
            ]
          : [],
    }, key());

    if (!result.ok) {
      setFormError(result.error);
      setConfirmOpen(false);
      return;
    }
    // The operation is done; the next submission from this form is a
    // new one and must not be answered from this one's result.
    resetKey();

    toast.success(status === "DRAFT" ? "تم حفظ المسودة" : "تم تسجيل البيع بنجاح");
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
              {success.status === "DRAFT" ? "تم حفظ المسودة" : "تم تسجيل البيع بنجاح"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {success.status === "DRAFT"
                ? "لم تتغيّر الكميات ولم يُسجَّل أي مبلغ. أكمل المسودة عند إتمام البيع."
                : "تم خصم الكميات من المخزون وتسجيل العملية على حساب العميل."}
            </p>
          </div>

          <div className="bg-muted/50 grid w-full max-w-md gap-2 rounded-xl p-4 text-sm">
            <Row label="رقم البيع" value={success.sale_number} bold />
            <Row label="الإجمالي" value={formatMoney(success.total_amount)} />
            <Row label="المدفوع" value={formatMoney(success.paid_amount)} tone="positive" />
            <Row
              label="المتبقي"
              value={formatMoney(success.remaining_amount)}
              tone={Number(success.remaining_amount) > 0 ? "negative" : undefined}
            />
            {canSeeProfit ? (
              <>
                <Separator className="my-1" />
                <Row label="الربح الإجمالي" value={formatMoney(success.gross_profit)} />
              </>
            ) : null}
            <Separator className="my-1" />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">حالة الدفع</span>
              <SalePaymentStatusBadge status={success.payment_status} />
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={`/sales/${success.id}`}>عرض البيع</Link>
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
                setCustomerId(WALK_IN);
              }}
            >
              بيع جديد
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
          <CardTitle>بيانات البيع</CardTitle>
          <CardDescription>
            اختر العميل أو تابع كزبون عابر دون إنشاء سجل.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customer">العميل</Label>
            <div className="flex gap-2">
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger id="customer" className="h-11 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WALK_IN}>زبون عابر</SelectItem>
                  {customerList.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.phone ? ` — ${customer.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {canCreateCustomer ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0"
                  onClick={() => setCustomerDialogOpen(true)}
                  aria-label="إضافة عميل جديد"
                >
                  <UserPlus className="size-4" />
                </Button>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              الزبون العابر لا يُنشئ سجل عميل ولا رصيداً.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sale_date">
              تاريخ البيع <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sale_date"
              type="date"
              className="h-11"
              value={saleDate}
              onChange={(event) => setSaleDate(event.target.value)}
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
              ابحث واختر القطع المباعة. المتوفر يظهر لكل موديل.
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
              description="اضغط «إضافة منتج» لاختيار القطع المباعة."
            />
          ) : (
            lines.map((line) => {
              const qty = Number(line.quantity) || 0;
              const price = Number(line.unit_price) || 0;
              const lineTotal = qty * price;
              const overStock = qty > line.current_stock;
              const belowList = price < line.selling_price;

              return (
                <div
                  key={line.variant_id}
                  className={cn(
                    "border-border/70 bg-muted/20 rounded-xl border p-3",
                    overStock && "border-destructive/50 bg-destructive/5",
                  )}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <ProductThumb
                        url={line.image_url}
                        alt={line.product_name}
                        className="size-12"
                      />
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate font-medium">{line.product_name}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          <bdi>{line.sku}</bdi>
                          {line.color ? ` · ${line.color}` : ""}
                          {line.size ? ` · ${line.size}` : ""}
                          {` · المتوفر ${formatNumber(line.current_stock)}`}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-auto">
                      <div className="space-y-1">
                        <Label className="text-xs">الكمية</Label>
                        <Input
                          inputMode="numeric"
                          dir="ltr"
                          className={cn(
                            "h-10 w-full text-left sm:w-24",
                            overStock && "border-destructive",
                          )}
                          value={line.quantity}
                          onChange={(event) =>
                            patchLine(line.variant_id, { quantity: event.target.value })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">سعر البيع</Label>
                        <Input
                          inputMode="decimal"
                          dir="ltr"
                          className={cn(
                            "h-10 w-full text-left sm:w-28",
                            belowList && "border-gold",
                          )}
                          value={line.unit_price}
                          onChange={(event) =>
                            patchLine(line.variant_id, { unit_price: event.target.value })
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
                          onClick={() =>
                            setLines((current) =>
                              current.filter((l) => l.variant_id !== line.variant_id),
                            )
                          }
                          aria-label={`حذف ${line.sku}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {overStock ? (
                    <p className="text-destructive mt-2 text-xs font-medium">
                      الكمية المطلوبة أكبر من المخزون المتوفر.
                    </p>
                  ) : belowList ? (
                    <p className="text-warning-foreground mt-2 text-xs">
                      سعر البيع أقل من السعر الافتراضي (
                      {formatMoney(line.selling_price)}).
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- payment */}
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
                <p className="text-muted-foreground text-xs">استلام مباشر في الصندوق.</p>
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
                  className={cn("h-11 text-left", totals.overpaid && "border-destructive")}
                  value={paid}
                  onChange={(event) => setPaid(event.target.value)}
                />
                {totals.overpaid ? (
                  <p className="text-destructive text-xs">
                    المبلغ المدفوع لا يمكن أن يكون أكبر من الإجمالي.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    اتركه صفراً إذا كان البيع آجلاً.
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
                    onChange={(event) => setTransferReference(event.target.value)}
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
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="ملاحظات على هذه العملية."
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
              <span className="text-lg font-semibold">{formatMoney(totals.total)}</span>
            </div>
            <Row label="المدفوع" value={formatMoney(totals.paid)} tone="positive" />
            <Row
              label="المتبقي"
              value={formatMoney(totals.remaining)}
              tone={totals.remaining > 0 ? "negative" : undefined}
            />

            {canSeeProfit ? (
              <>
                <Separator />
                <Row label="التكلفة" value={formatMoney(totals.cost)} />
                <Row
                  label="الربح الإجمالي"
                  value={formatMoney(totals.grossProfit)}
                  tone={totals.grossProfit >= 0 ? "positive" : "negative"}
                />
                <Row label="هامش الربح" value={formatPercent(totals.grossMargin)} />
              </>
            ) : null}

            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">حالة الدفع</span>
              <SalePaymentStatusBadge status={totals.paymentStatus} />
            </div>

            {overStocked.length > 0 ? (
              <p className="text-destructive pt-1 text-xs leading-relaxed">
                الكمية المطلوبة أكبر من المخزون المتوفر:{" "}
                {overStocked.map((l) => l.sku).join("، ")}
              </p>
            ) : null}
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
              {isPending && !savingDraft ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                "إتمام البيع"
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

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => router.push("/sales")}
              disabled={isPending}
            >
              إلغاء
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Tablet and below: the summary sits far down the page, so the total and
          the primary action follow the cashier. */}
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
            className="shrink-0"
            disabled={!canSubmit || isPending}
            onClick={() => setConfirmOpen(true)}
          >
            إتمام البيع
          </Button>
        </div>
      </div>

      <SaleVariantPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={addVariant}
        inBasket={inBasket}
      />

      {customerDialogOpen ? (
        <CustomerDialog
          open={customerDialogOpen}
          onOpenChange={setCustomerDialogOpen}
          onCreated={(created) => {
            setCustomerList((current) => [
              ...current,
              {
                id: created.id,
                customer_number: "",
                name: created.name,
                phone: null,
              },
            ]);
            setCustomerId(created.id);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="تأكيد إتمام البيع؟"
        description="سيتم خصم الكميات من المخزون وتسجيل العملية على حساب العميل."
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
  bold,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium",
          bold && "font-semibold",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}
