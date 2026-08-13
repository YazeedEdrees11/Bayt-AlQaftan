"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useIdempotencyKey } from "@/lib/hooks/use-idempotency-key";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  FileText,
  LoaderCircle,
  PackageSearch,
  Paperclip,
  Receipt,
  X,
} from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ProductThumb } from "@/components/catalog/product-thumb";
import { SalePicker, type PickedSale } from "./sale-picker";
import { REFUND_RECEIPT_ACCEPT } from "./refund-accept";
import {
  createReturnAction,
  getReturnableItemsAction,
  uploadRefundReceiptAction,
} from "@/app/actions/returns";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import {
  CONDITION_LABELS,
  ITEM_CONDITIONS,
  REFUND_METHODS,
  REFUND_METHOD_LABELS,
  RETURN_REASONS,
  RETURN_REASON_LABELS,
  calculateReturnTotals,
  type InventoryItemCondition,
  type RefundMethod,
  type ReturnableSaleItem,
  type ReturnReason,
} from "@/types/returns";

type Line = {
  sale_item_id: string;
  quantity: string;
  condition: InventoryItemCondition;
};

/**
 * Records a customer return.
 *
 * Two rules shape this screen. First, a line can only give back what is still
 * outstanding — every earlier return AND every exchange has already eaten into
 * the allowance, and the remaining figure comes from the server. Second, the
 * refund is based on the price the customer actually paid: the sale's discount
 * was shared across its lines, so a 100 item on a sale with a 20 discount comes
 * back as 80, not 100.
 */
export function ReturnForm({
  canRefund,
  initialSale = null,
  initialItems = [],
}: {
  canRefund: boolean;
  /** Pre-selected sale, resolved on the server from `?sale=`. */
  initialSale?: PickedSale | null;
  initialItems?: ReturnableSaleItem[];
}) {
  const { key, reset: resetKey } = useIdempotencyKey();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [sale, setSale] = useState<PickedSale | null>(initialSale);
  const [items, setItems] = useState<ReturnableSaleItem[]>(initialItems);
  const [loadingItems, setLoadingItems] = useState(false);
  const [lines, setLines] = useState<Record<string, Line>>({});

  const [reason, setReason] = useState<ReturnReason | "">("");
  const [notes, setNotes] = useState("");

  const [refundMethod, setRefundMethod] = useState<RefundMethod | "NONE">(
    canRefund ? "CASH" : "NONE",
  );
  // null = follow the basket; a string = the cashier typed their own figure.
  const [refundOverride, setRefundOverride] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const receiptInput = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [created, setCreated] = useState<{
    return_number: string;
    refund_amount: number;
    refunded_amount: number;
    id: string;
  } | null>(null);

  /**
   * Picking a sale is a user action, not a synchronisation, so the lines load
   * here rather than in an effect watching `sale`.
   */
  function selectSale(next: PickedSale) {
    setSale(next);
    setLines({});
    setRefundOverride(null);
    setLoadingItems(true);
    startTransition(async () => {
      const result = await getReturnableItemsAction(next.id);
      if (result.ok && result.data) {
        setItems(result.data.items);
        setError(null);
      } else {
        setItems([]);
        setError(result.ok ? null : result.error);
      }
      setLoadingItems(false);
    });
  }

  const chosen = useMemo(
    () =>
      Object.values(lines)
        .map((line) => {
          const item = items.find((i) => i.sale_item_id === line.sale_item_id);
          if (!item) return null;
          const quantity = Number(line.quantity) || 0;
          if (quantity <= 0) return null;
          return { line, item, quantity };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    [lines, items],
  );

  const totals = useMemo(
    () =>
      calculateReturnTotals(
        chosen.map((c) => ({
          quantity: c.quantity,
          net_unit_price: Number(c.item.net_unit_price),
          unit_price: Number(c.item.unit_price),
          unit_cost: Number(c.item.unit_cost),
        })),
      ),
    [chosen],
  );

  // Defaults to the whole value; a smaller figure leaves the rest as credit on
  // the customer's account rather than losing it.
  const refundAmount =
    refundOverride ?? (totals.refund > 0 ? String(totals.refund) : "");

  const overQuantity = chosen.filter((c) => c.quantity > c.item.returnable_quantity);
  const refundValue = Number(refundAmount) || 0;
  const refundTooBig = refundMethod !== "NONE" && refundValue > totals.refund;
  const bankIncomplete =
    refundMethod === "BANK_TRANSFER" &&
    (!bankName.trim() || !transferReference.trim());
  const creditWithoutCustomer =
    refundMethod === "CUSTOMER_CREDIT" && sale !== null && !sale.customer_id;

  const canSubmit =
    !!sale &&
    chosen.length > 0 &&
    overQuantity.length === 0 &&
    !refundTooBig &&
    !bankIncomplete &&
    !creditWithoutCustomer;

  function patchLine(saleItemId: string, patch: Partial<Line>) {
    setLines((current) => {
      const existing = current[saleItemId] ?? {
        sale_item_id: saleItemId,
        quantity: "",
        condition: "GOOD" as InventoryItemCondition,
      };
      return { ...current, [saleItemId]: { ...existing, ...patch } };
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      let receiptPath = "";
      if (receiptFile && refundMethod === "BANK_TRANSFER") {
        const formData = new FormData();
        formData.set("key", sale?.customer_id ?? "walkin");
        formData.set("file", receiptFile);
        const uploaded = await uploadRefundReceiptAction(formData);
        if (!uploaded.ok) {
          setError(uploaded.error);
          return;
        }
        receiptPath = uploaded.data?.path ?? "";
      }

      const result = await createReturnAction({
        sale_id: sale?.id,
        reason: reason || undefined,
        notes: notes.trim() || undefined,
        items: chosen.map((c) => ({
          sale_item_id: c.item.sale_item_id,
          quantity: String(c.quantity),
          condition: c.line.condition,
        })),
        refunds:
          refundMethod === "NONE" || refundValue <= 0
            ? []
            : [
                {
                  refund_method: refundMethod,
                  amount: String(refundValue),
                  bank_name: bankName.trim() || undefined,
                  transfer_reference: transferReference.trim() || undefined,
                  receipt_image_path: receiptPath || undefined,
                },
              ],
      }, key());

      if (!result.ok) {
        setError(result.error);
        return;
      }
    // The operation is done; the next submission from this form is a
    // new one and must not be answered from this one's result.
    resetKey();
      setCreated({
        id: result.data!.id,
        return_number: result.data!.return_number,
        refund_amount: result.data!.refund_amount,
        refunded_amount: result.data!.refunded_amount,
      });
      router.refresh();
    });
  }

  if (created) {
    return (
      <Card className="border-success/30 bg-success/5">
        <CardContent className="space-y-4 py-8 text-center">
          <CheckCircle2 className="text-success mx-auto size-10" />
          <div className="space-y-1">
            <p className="text-lg font-semibold">تم تسجيل المرتجع بنجاح</p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              تمت إعادة الكمية إلى المخزون وتسجيل الأثر المالي للعملية.
            </p>
          </div>

          <div className="mx-auto grid max-w-md gap-2 text-sm">
            <Row label="رقم المرتجع" value={created.return_number} />
            <Row label="قيمة المرتجع" value={formatMoney(created.refund_amount)} />
            <Row label="المسترد" value={formatMoney(created.refunded_amount)} />
            {created.refund_amount - created.refunded_amount > 0 ? (
              <p className="text-warning-foreground border-gold/40 bg-gold/10 rounded-xl border px-3 py-2 text-xs leading-relaxed">
                تبقّى {formatMoney(created.refund_amount - created.refunded_amount)} كرصيد
                للعميل ولم يُفقد — يمكن تسجيل الاسترداد لاحقاً من صفحة المرتجع.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={`/returns/${created.id}`}>عرض المرتجع</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreated(null);
                setSale(null);
                setItems([]);
                setLines({});
                setReason("");
                setNotes("");
                setRefundOverride(null);
                setReceiptFile(null);
              }}
            >
              مرتجع جديد
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="border-destructive/25 bg-destructive/8 text-destructive rounded-xl border px-3.5 py-3 text-sm leading-relaxed"
        >
          {error}
        </p>
      ) : null}

      {/* ---------------------------------------------------------- the sale */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>عملية البيع الأصلية</CardTitle>
            <CardDescription>
              اختر العملية التي يريد العميل الإرجاع منها.
            </CardDescription>
          </div>
          <Button type="button" onClick={() => setPickerOpen(true)}>
            <Receipt className="size-4" />
            {sale ? "تغيير العملية" : "اختيار عملية"}
          </Button>
        </CardHeader>

        {sale ? (
          <CardContent className="text-sm">
            <div className="border-border/70 bg-muted/20 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border p-3">
              <span className="font-medium">
                <bdi>{sale.sale_number || "—"}</bdi>
              </span>
              <span className="text-muted-foreground">
                {sale.customer_name ?? "زبون عابر"}
              </span>
              {sale.total_amount > 0 ? (
                <span className="text-muted-foreground">
                  الإجمالي {formatMoney(sale.total_amount)}
                </span>
              ) : null}
            </div>
          </CardContent>
        ) : null}
      </Card>

      {/* --------------------------------------------------------- the items */}
      <Card>
        <CardHeader>
          <CardTitle>المنتجات المرتجعة</CardTitle>
          <CardDescription>
            حدّد الكمية المرتجعة لكل صنف. المتبقي للإرجاع يحتسب المرتجعات
            والاستبدالات السابقة.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {!sale ? (
            <EmptyState
              compact
              icon={Receipt}
              title="لم يتم اختيار عملية بيع"
              description="اختر عملية البيع أولاً لعرض بنودها."
            />
          ) : loadingItems ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
              <LoaderCircle className="size-4 animate-spin" />
              جاري تحميل البنود...
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              compact
              icon={PackageSearch}
              title="لا توجد بنود"
              description="هذه العملية لا تحتوي على بنود قابلة للإرجاع."
            />
          ) : (
            items.map((item) => {
              const line = lines[item.sale_item_id];
              const quantity = Number(line?.quantity) || 0;
              const exhausted = item.returnable_quantity <= 0;
              const over = quantity > item.returnable_quantity;

              return (
                <div
                  key={item.sale_item_id}
                  className={cn(
                    "border-border/70 bg-muted/20 rounded-xl border p-3",
                    over && "border-destructive/50 bg-destructive/5",
                    exhausted && "opacity-60",
                  )}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <ProductThumb
                        url={item.image_url ?? null}
                        alt={item.product_name_snapshot}
                        className="size-12"
                      />
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate font-medium">
                          {item.product_name_snapshot}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          <bdi>{item.variant_sku_snapshot}</bdi>
                          {item.color_snapshot ? ` · ${item.color_snapshot}` : ""}
                          {item.size_snapshot ? ` · ${item.size_snapshot}` : ""}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          المباعة {formatNumber(item.sold_quantity)} · المرتجعة{" "}
                          {formatNumber(item.returned_quantity)} ·{" "}
                          <span
                            className={cn(
                              "font-medium",
                              exhausted ? "text-destructive" : "text-success",
                            )}
                          >
                            المتبقي للإرجاع {formatNumber(item.returnable_quantity)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-auto">
                      <div className="space-y-1">
                        <Label className="text-xs">الكمية</Label>
                        <Input
                          inputMode="numeric"
                          dir="ltr"
                          disabled={exhausted}
                          className={cn(
                            "h-10 w-full text-left sm:w-24",
                            over && "border-destructive",
                          )}
                          value={line?.quantity ?? ""}
                          onChange={(event) =>
                            patchLine(item.sale_item_id, {
                              quantity: event.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">الحالة</Label>
                        <Select
                          value={line?.condition ?? "GOOD"}
                          onValueChange={(value) =>
                            patchLine(item.sale_item_id, {
                              condition: value as InventoryItemCondition,
                            })
                          }
                          disabled={exhausted}
                        >
                          <SelectTrigger className="h-10 w-full sm:w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ITEM_CONDITIONS.map((condition) => (
                              <SelectItem key={condition} value={condition}>
                                {CONDITION_LABELS[condition]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">سعر الوحدة</Label>
                        <div className="border-border/70 bg-card flex h-10 items-center rounded-md border px-3 text-sm">
                          {formatMoney(item.net_unit_price)}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">قيمة الإرجاع</Label>
                        <div className="border-border/70 bg-card flex h-10 items-center rounded-md border px-3 text-sm font-medium">
                          {formatMoney(quantity * Number(item.net_unit_price))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {over ? (
                    <p className="text-destructive mt-2 text-xs font-medium">
                      لا يمكن إرجاع كمية أكبر من الكمية المباعة.
                    </p>
                  ) : exhausted ? (
                    <p className="text-muted-foreground mt-2 text-xs">
                      لا توجد كمية متبقية للإرجاع.
                    </p>
                  ) : Number(item.net_unit_price) < Number(item.unit_price) ? (
                    <p className="text-muted-foreground mt-2 text-xs">
                      السعر بعد توزيع خصم الفاتورة (السعر الأصلي{" "}
                      {formatMoney(item.unit_price)}).
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------- reason and refund */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>سبب الإرجاع والاسترداد</CardTitle>
            <CardDescription>
              {canRefund
                ? "اختر طريقة إعادة المبلغ للعميل."
                : "تسجيل الاسترداد يحتاج صلاحية مدير — سيُسجَّل المرتجع بدون استرداد."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reason">سبب الإرجاع</Label>
                <Select
                  value={reason || undefined}
                  onValueChange={(value) => setReason(value as ReturnReason)}
                >
                  <SelectTrigger id="reason" className="h-11 w-full">
                    <SelectValue placeholder="اختر السبب" />
                  </SelectTrigger>
                  <SelectContent>
                    {RETURN_REASONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {RETURN_REASON_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {canRefund ? (
                <div className="space-y-2">
                  <Label htmlFor="refund_method">طريقة الاسترداد</Label>
                  <Select
                    value={refundMethod}
                    onValueChange={(value) =>
                      setRefundMethod(value as RefundMethod | "NONE")
                    }
                  >
                    <SelectTrigger id="refund_method" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">بدون استرداد الآن</SelectItem>
                      {REFUND_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {REFUND_METHOD_LABELS[method]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            {canRefund && refundMethod !== "NONE" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="refund_amount">المبلغ المسترد</Label>
                  <Input
                    id="refund_amount"
                    inputMode="decimal"
                    dir="ltr"
                    className={cn("h-11 text-left", refundTooBig && "border-destructive")}
                    value={refundAmount}
                    onChange={(event) => setRefundOverride(event.target.value)}
                  />
                  {refundTooBig ? (
                    <p className="text-destructive text-xs">
                      المبلغ المسترد أكبر من قيمة المرتجع.
                    </p>
                  ) : null}
                </div>

                {refundMethod === "BANK_TRANSFER" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="bank_name">اسم البنك</Label>
                      <Input
                        id="bank_name"
                        className="h-11"
                        value={bankName}
                        placeholder="مثال: البنك العربي"
                        onChange={(event) => setBankName(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="transfer_reference">رقم التحويل</Label>
                      <Input
                        id="transfer_reference"
                        dir="ltr"
                        className="h-11 text-left"
                        value={transferReference}
                        placeholder="REF-000000"
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

                {creditWithoutCustomer ? (
                  <p className="text-destructive text-xs sm:col-span-2">
                    لا يمكن إضافة رصيد لعميل غير مسجل.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                placeholder="ملاحظات على هذا المرتجع."
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>الملخص</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Row label="عدد الأصناف" value={formatNumber(chosen.length)} />
            <Row
              label="عدد القطع"
              value={formatNumber(chosen.reduce((sum, c) => sum + c.quantity, 0))}
            />
            <Separator />
            <Row label="قيمة القطع" value={formatMoney(totals.subtotal)} />
            <Row label="حصة الخصم" value={`− ${formatMoney(totals.discount)}`} />
            <div className="flex items-center justify-between">
              <span className="font-medium">قيمة المرتجع</span>
              <span className="text-lg font-semibold">
                {formatMoney(totals.refund)}
              </span>
            </div>
            {canRefund && refundMethod !== "NONE" ? (
              <>
                <Row
                  label="المسترد الآن"
                  value={formatMoney(refundValue)}
                  tone="positive"
                />
                {totals.refund - refundValue > 0 ? (
                  <Row
                    label="يبقى كرصيد"
                    value={formatMoney(totals.refund - refundValue)}
                    tone="negative"
                  />
                ) : null}
              </>
            ) : null}

            <Separator />
            <Row label="تكلفة القطع" value={formatMoney(totals.cost)} />
            <Row
              label="عكس الربح"
              value={`− ${formatMoney(totals.profitReversal)}`}
              tone="negative"
            />

            {overQuantity.length > 0 ? (
              <p className="text-destructive pt-1 text-xs">
                لا يمكن إرجاع كمية أكبر من الكمية المباعة:{" "}
                {overQuantity.map((c) => c.item.variant_sku_snapshot).join("، ")}
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
                <>
                  <FileText className="size-4" />
                  تسجيل المرتجع
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Tablet and below: the summary sits far down the page. */}
      <div className="bg-card/95 border-border/70 fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 shadow-[0_-4px_16px_-8px_oklch(0_0_0/0.15)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">قيمة المرتجع</p>
            <p className="truncate text-lg font-semibold">
              {formatMoney(totals.refund)}
            </p>
          </div>
          <Button
            type="button"
            className="shrink-0"
            disabled={!canSubmit || isPending}
            onClick={() => setConfirmOpen(true)}
          >
            تسجيل المرتجع
          </Button>
        </div>
      </div>

      <SalePicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={selectSale} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="تأكيد المرتجع؟"
        description="سيتم إعادة الكمية إلى المخزون وتسجيل الأثر المالي للعملية."
        confirmLabel="تأكيد وحفظ"
        onConfirm={submit}
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
