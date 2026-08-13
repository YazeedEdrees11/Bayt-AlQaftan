"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useIdempotencyKey } from "@/lib/hooks/use-idempotency-key";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftRight,
  CheckCircle2,
  LoaderCircle,
  PackageSearch,
  Paperclip,
  Plus,
  Receipt,
  Trash2,
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
import { SalePicker, type PickedSale } from "@/components/returns/sale-picker";
import { ExchangeVariantPicker } from "./exchange-variant-picker";
import { REFUND_RECEIPT_ACCEPT } from "@/components/returns/refund-accept";
import {
  createExchangeAction,
  getReturnableItemsAction,
  uploadRefundReceiptAction,
} from "@/app/actions/returns";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import {
  CONDITION_LABELS,
  ITEM_CONDITIONS,
  RETURN_REASONS,
  RETURN_REASON_LABELS,
  SETTLEMENT_METHODS,
  SETTLEMENT_METHOD_LABELS,
  calculateExchangeDifference,
  type InventoryItemCondition,
  type ReturnableSaleItem,
  type ReturnReason,
  type SettlementMethod,
} from "@/types/returns";
import type { SellableVariant } from "@/types/sales";

type ReturnedLine = { quantity: string; condition: InventoryItemCondition };
type NewLine = {
  variant_id: string;
  product_name: string;
  sku: string;
  color: string | null;
  size: string | null;
  image_url: string | null;
  current_stock: number;
  selling_price: number;
  quantity: string;
  unit_price: string;
};

/**
 * Records an exchange: goods come back, different goods go out, and only the
 * difference changes hands.
 *
 * It is deliberately not a return plus a sale. Modelling it that way would add
 * the replacement's full value to the day's sales, which would overstate what
 * the shop actually sold.
 */
export function ExchangeForm({
  initialSale = null,
  initialItems = [],
  reasonRequired = true,
}: {
  initialSale?: PickedSale | null;
  initialItems?: ReturnableSaleItem[];
  /**
   * Mirrors `require_exchange_reason`. The server is the authority — this only
   * decides whether the shop assistant is stopped here or after a round trip.
   */
  reasonRequired?: boolean;
}) {
  const { key, reset: resetKey } = useIdempotencyKey();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [salePickerOpen, setSalePickerOpen] = useState(false);
  const [variantPickerOpen, setVariantPickerOpen] = useState(false);
  const [sale, setSale] = useState<PickedSale | null>(initialSale);
  const [items, setItems] = useState<ReturnableSaleItem[]>(initialItems);
  const [loadingItems, setLoadingItems] = useState(false);

  const [returned, setReturned] = useState<Record<string, ReturnedLine>>({});
  const [newLines, setNewLines] = useState<NewLine[]>([]);

  const [settlement, setSettlement] = useState<SettlementMethod>("CASH");
  const [bankName, setBankName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const receiptInput = useRef<HTMLInputElement>(null);
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [created, setCreated] = useState<{
    id: string;
    exchange_number: string;
    difference_amount: number;
    difference_direction: string;
  } | null>(null);

  function selectSale(next: PickedSale) {
    setSale(next);
    setReturned({});
    setNewLines([]);
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

  function addVariant(variant: SellableVariant) {
    setNewLines((current) => {
      if (current.some((line) => line.variant_id === variant.variant_id)) return current;
      return [
        ...current,
        {
          variant_id: variant.variant_id,
          product_name: variant.product_name,
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          image_url: variant.image_url,
          current_stock: variant.current_stock,
          selling_price: Number(variant.selling_price),
          quantity: "1",
          unit_price: String(variant.selling_price),
        },
      ];
    });
  }

  const chosenReturned = useMemo(
    () =>
      Object.entries(returned)
        .map(([saleItemId, line]) => {
          const item = items.find((i) => i.sale_item_id === saleItemId);
          const quantity = Number(line.quantity) || 0;
          if (!item || quantity <= 0) return null;
          return { item, line, quantity };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    [returned, items],
  );

  const returnedTotal = useMemo(
    () =>
      Math.round(
        chosenReturned.reduce(
          (sum, c) => sum + c.quantity * Number(c.item.net_unit_price),
          0,
        ) * 100,
      ) / 100,
    [chosenReturned],
  );

  const newTotal = useMemo(
    () =>
      Math.round(
        newLines.reduce(
          (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
          0,
        ) * 100,
      ) / 100,
    [newLines],
  );

  const { difference, direction } = calculateExchangeDifference(returnedTotal, newTotal);

  const overReturn = chosenReturned.filter(
    (c) => c.quantity > c.item.returnable_quantity,
  );
  const overStock = newLines.filter(
    (l) => (Number(l.quantity) || 0) > l.current_stock,
  );
  const bankIncomplete =
    settlement === "BANK_TRANSFER" && (!bankName.trim() || !transferReference.trim());
  const balanceWithoutCustomer =
    settlement === "CUSTOMER_BALANCE" && sale !== null && !sale.customer_id;

  const canSubmit =
    !!sale &&
    (!reasonRequired || reason !== "") &&
    chosenReturned.length > 0 &&
    newLines.length > 0 &&
    overReturn.length === 0 &&
    overStock.length === 0 &&
    (direction === "EVEN" || (!bankIncomplete && !balanceWithoutCustomer));

  function submit() {
    setError(null);
    startTransition(async () => {
      let receiptPath = "";
      if (receiptFile && settlement === "BANK_TRANSFER" && direction !== "EVEN") {
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

      const result = await createExchangeAction({
        sale_id: sale?.id,
        notes: notes.trim() || undefined,
        returned_items: chosenReturned.map((c) => ({
          sale_item_id: c.item.sale_item_id,
          quantity: String(c.quantity),
          condition: c.line.condition,
        })),
        new_items: newLines.map((l) => ({
          variant_id: l.variant_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
        })),
        reason: reason || undefined,
        settlement_method: settlement,
        bank_name: bankName.trim() || undefined,
        transfer_reference: transferReference.trim() || undefined,
        receipt_image_path: receiptPath || undefined,
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
        exchange_number: result.data!.exchange_number,
        difference_amount: result.data!.difference_amount,
        difference_direction: result.data!.difference_direction,
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
            <p className="text-lg font-semibold">تم تسجيل الاستبدال بنجاح</p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              تم إخراج المنتج البديل وإعادة المنتج المرتجع إلى المخزون.
            </p>
          </div>

          <div className="mx-auto grid max-w-md gap-2 text-sm">
            <Row label="رقم الاستبدال" value={created.exchange_number} />
            <Row
              label={
                created.difference_direction === "CUSTOMER_PAYS"
                  ? "العميل يدفع"
                  : created.difference_direction === "CUSTOMER_RECEIVES"
                    ? "العميل يستلم"
                    : "الفرق"
              }
              value={formatMoney(created.difference_amount)}
            />
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={`/exchanges/${created.id}`}>عرض الاستبدال</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreated(null);
                setSale(null);
                setItems([]);
                setReturned({});
                setNewLines([]);
                setNotes("");
                setReceiptFile(null);
              }}
            >
              استبدال جديد
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

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>عملية البيع الأصلية</CardTitle>
            <CardDescription>اختر العملية التي يريد العميل الاستبدال منها.</CardDescription>
          </div>
          <Button type="button" onClick={() => setSalePickerOpen(true)}>
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
            </div>
          </CardContent>
        ) : null}
      </Card>

      {/* --------------------------------------------------- returned goods */}
      <Card>
        <CardHeader>
          <CardTitle>المنتج المرتجع</CardTitle>
          <CardDescription>ما سيعيده العميل من عملية البيع الأصلية.</CardDescription>
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
          ) : (
            items.map((item) => {
              const line = returned[item.sale_item_id];
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
                        <p className="truncate font-medium">{item.product_name_snapshot}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          <bdi>{item.variant_sku_snapshot}</bdi>
                          {item.color_snapshot ? ` · ${item.color_snapshot}` : ""}
                          {item.size_snapshot ? ` · ${item.size_snapshot}` : ""}
                          {` · المتبقي للإرجاع ${formatNumber(item.returnable_quantity)}`}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:w-auto">
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
                            setReturned((current) => ({
                              ...current,
                              [item.sale_item_id]: {
                                condition: current[item.sale_item_id]?.condition ?? "GOOD",
                                quantity: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">الحالة</Label>
                        <Select
                          value={line?.condition ?? "GOOD"}
                          disabled={exhausted}
                          onValueChange={(value) =>
                            setReturned((current) => ({
                              ...current,
                              [item.sale_item_id]: {
                                quantity: current[item.sale_item_id]?.quantity ?? "",
                                condition: value as InventoryItemCondition,
                              },
                            }))
                          }
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
                        <Label className="text-xs">القيمة</Label>
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
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- new goods */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>المنتج البديل</CardTitle>
            <CardDescription>ما سيأخذه العميل بدلاً من المرتجع.</CardDescription>
          </div>
          <Button type="button" onClick={() => setVariantPickerOpen(true)}>
            <Plus className="size-4" />
            إضافة منتج
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {newLines.length === 0 ? (
            <EmptyState
              compact
              icon={PackageSearch}
              title="لم تتم إضافة منتجات"
              description="اضغط «إضافة منتج» لاختيار البديل."
            />
          ) : (
            newLines.map((line) => {
              const quantity = Number(line.quantity) || 0;
              const over = quantity > line.current_stock;

              return (
                <div
                  key={line.variant_id}
                  className={cn(
                    "border-border/70 bg-muted/20 rounded-xl border p-3",
                    over && "border-destructive/50 bg-destructive/5",
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
                            over && "border-destructive",
                          )}
                          value={line.quantity}
                          onChange={(event) =>
                            setNewLines((current) =>
                              current.map((l) =>
                                l.variant_id === line.variant_id
                                  ? { ...l, quantity: event.target.value }
                                  : l,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">السعر</Label>
                        <Input
                          inputMode="decimal"
                          dir="ltr"
                          className="h-10 w-full text-left sm:w-28"
                          value={line.unit_price}
                          onChange={(event) =>
                            setNewLines((current) =>
                              current.map((l) =>
                                l.variant_id === line.variant_id
                                  ? { ...l, unit_price: event.target.value }
                                  : l,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">الإجمالي</Label>
                        <div className="border-border/70 bg-card flex h-10 items-center rounded-md border px-3 text-sm font-medium">
                          {formatMoney(quantity * (Number(line.unit_price) || 0))}
                        </div>
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive h-10"
                          onClick={() =>
                            setNewLines((current) =>
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

                  {over ? (
                    <p className="text-destructive mt-2 text-xs font-medium">
                      المنتج غير متوفر بالكمية المطلوبة.
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ difference */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>تسوية الفرق</CardTitle>
            <CardDescription>
              {direction === "EVEN"
                ? "لا يوجد فرق مالي بين المرتجع والبديل."
                : direction === "CUSTOMER_PAYS"
                  ? "العميل يدفع الفرق."
                  : "العميل يستلم الفرق."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="exchange_reason">
                سبب الاستبدال{reasonRequired ? " *" : ""}
              </Label>
              <Select
                value={reason || undefined}
                onValueChange={(value) => setReason(value as ReturnReason)}
              >
                <SelectTrigger id="exchange_reason" className="h-11 w-full sm:max-w-xs">
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
              {reasonRequired && reason === "" ? (
                <p className="text-xs text-muted-foreground">
                  سبب الاستبدال مطلوب حسب إعدادات المتجر.
                </p>
              ) : null}
            </div>

            {direction !== "EVEN" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="settlement">طريقة التسوية</Label>
                  <Select
                    value={settlement}
                    onValueChange={(value) => setSettlement(value as SettlementMethod)}
                  >
                    <SelectTrigger id="settlement" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SETTLEMENT_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {SETTLEMENT_METHOD_LABELS[method]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {settlement === "BANK_TRANSFER" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="exc_bank">اسم البنك</Label>
                      <Input
                        id="exc_bank"
                        className="h-11"
                        placeholder="مثال: البنك العربي"
                        value={bankName}
                        onChange={(event) => setBankName(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="exc_ref">رقم التحويل</Label>
                      <Input
                        id="exc_ref"
                        dir="ltr"
                        className="h-11 text-left"
                        placeholder="REF-000000"
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

                {balanceWithoutCustomer ? (
                  <p className="text-destructive text-xs sm:col-span-2">
                    لا يمكن إضافة رصيد لعميل غير مسجل.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="exc_notes">ملاحظات</Label>
              <Textarea
                id="exc_notes"
                rows={3}
                value={notes}
                placeholder="ملاحظات على هذا الاستبدال."
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
            <Row label="قيمة المرتجع" value={formatMoney(returnedTotal)} />
            <Row label="قيمة البديل" value={formatMoney(newTotal)} />
            <Separator />
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {direction === "CUSTOMER_PAYS"
                  ? "العميل يدفع"
                  : direction === "CUSTOMER_RECEIVES"
                    ? "العميل يستلم"
                    : "الفرق"}
              </span>
              <span
                className={cn(
                  "text-lg font-semibold",
                  direction === "CUSTOMER_PAYS" && "text-success",
                  direction === "CUSTOMER_RECEIVES" && "text-destructive",
                )}
              >
                {formatMoney(difference)}
              </span>
            </div>

            {overStock.length > 0 ? (
              <p className="text-destructive pt-1 text-xs">
                لا يمكن إتمام الاستبدال بسبب نقص المخزون:{" "}
                {overStock.map((l) => l.sku).join("، ")}
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
                  <ArrowLeftRight className="size-4" />
                  تسجيل الاستبدال
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="bg-card/95 border-border/70 fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 shadow-[0_-4px_16px_-8px_oklch(0_0_0/0.15)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">
              {direction === "CUSTOMER_PAYS"
                ? "العميل يدفع"
                : direction === "CUSTOMER_RECEIVES"
                  ? "العميل يستلم"
                  : "الفرق"}
            </p>
            <p className="truncate text-lg font-semibold">{formatMoney(difference)}</p>
          </div>
          <Button
            type="button"
            className="shrink-0"
            disabled={!canSubmit || isPending}
            onClick={() => setConfirmOpen(true)}
          >
            تسجيل الاستبدال
          </Button>
        </div>
      </div>

      <SalePicker
        open={salePickerOpen}
        onOpenChange={setSalePickerOpen}
        onSelect={selectSale}
      />
      <ExchangeVariantPicker
        open={variantPickerOpen}
        onOpenChange={setVariantPickerOpen}
        onSelect={addVariant}
        chosen={newLines.map((l) => l.variant_id)}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="تأكيد الاستبدال؟"
        description="سيتم إخراج المنتج الجديد وإعادة المنتج المرتجع إلى المخزون."
        confirmLabel="تأكيد وحفظ"
        onConfirm={submit}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
