"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useIdempotencyKey } from "@/lib/hooks/use-idempotency-key";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  PackageSearch,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ProductThumb } from "@/components/catalog/product-thumb";
import { DifferenceBadge } from "@/components/returns/return-badges";
import {
  createAdjustmentAction,
  searchCountableVariantsAction,
} from "@/app/actions/returns";
import { formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import {
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REASON_LABELS,
  type InventoryAdjustmentReason,
} from "@/types/returns";

type CountableVariant = {
  variant_id: string;
  product_name: string;
  sku: string;
  color: string | null;
  size: string | null;
  current_stock: number;
  is_active: boolean;
  image_url: string | null;
};

type CountLine = CountableVariant & { actual: string; note: string };

/**
 * Records a physical stock count.
 *
 * The system figure shown here is what the screen last read — it is NOT what
 * the adjustment is calculated from. Only the counted number is sent; the
 * server re-reads the system quantity inside the transaction, under the
 * variant's row lock, so a sale made while the count was being typed cannot be
 * silently overwritten.
 */
export function AdjustmentForm() {
  const { key, reset: resetKey } = useIdempotencyKey();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [lines, setLines] = useState<CountLine[]>([]);
  const [reason, setReason] = useState<InventoryAdjustmentReason>("STOCK_COUNT");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [created, setCreated] = useState<{
    id: string;
    adjustment_number: string;
    total_increase: number;
    total_decrease: number;
    items_count: number;
  } | null>(null);

  const counted = useMemo(
    () =>
      lines
        .filter((line) => line.actual.trim() !== "")
        .map((line) => ({
          ...line,
          actualValue: Number(line.actual),
          difference: Number(line.actual) - line.current_stock,
        })),
    [lines],
  );

  const invalid = counted.filter(
    (line) => !Number.isInteger(line.actualValue) || line.actualValue < 0,
  );
  const increase = counted
    .filter((l) => l.difference > 0)
    .reduce((sum, l) => sum + l.difference, 0);
  const decrease = counted
    .filter((l) => l.difference < 0)
    .reduce((sum, l) => sum - l.difference, 0);

  const canSubmit = counted.length > 0 && invalid.length === 0;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createAdjustmentAction({
        reason,
        notes: notes.trim() || undefined,
        items: counted.map((line) => ({
          variant_id: line.variant_id,
          actual_quantity: String(line.actualValue),
          reason: line.note.trim() || undefined,
        })),
      }, key());

      if (!result.ok) {
        setError(result.error);
        return;
      }
    // The operation is done; the next submission from this form is a
    // new one and must not be answered from this one's result.
    resetKey();
      setCreated(result.data!);
      router.refresh();
    });
  }

  if (created) {
    return (
      <Card className="border-success/30 bg-success/5">
        <CardContent className="space-y-4 py-8 text-center">
          <CheckCircle2 className="text-success mx-auto size-10" />
          <div className="space-y-1">
            <p className="text-lg font-semibold">تم حفظ تعديل المخزون</p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              تم تسجيل فرق الكمية في حركة المخزون.
            </p>
          </div>

          <div className="mx-auto grid max-w-md gap-2 text-sm">
            <SummaryRow label="رقم التعديل" value={created.adjustment_number} />
            <SummaryRow label="عدد المنتجات" value={formatNumber(created.items_count)} />
            <SummaryRow
              label="إجمالي الزيادة"
              value={`+${formatNumber(created.total_increase)}`}
            />
            <SummaryRow
              label="إجمالي النقص"
              value={`−${formatNumber(created.total_decrease)}`}
            />
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={`/inventory/adjustments/${created.id}`}>عرض التعديل</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreated(null);
                setLines([]);
                setNotes("");
              }}
            >
              تعديل جديد
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
            <CardTitle>المنتجات</CardTitle>
            <CardDescription>
              اختر الموديلات المجرودة وأدخل الكمية الفعلية لكل منها.
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
              icon={ClipboardList}
              title="لم تتم إضافة منتجات"
              description="اضغط «إضافة منتج» لبدء الجرد."
            />
          ) : (
            lines.map((line) => {
              const hasCount = line.actual.trim() !== "";
              const actual = Number(line.actual);
              const bad = hasCount && (!Number.isInteger(actual) || actual < 0);
              const difference = hasCount && !bad ? actual - line.current_stock : 0;

              return (
                <div
                  key={line.variant_id}
                  className={cn(
                    "border-border/70 bg-muted/20 rounded-xl border p-3",
                    bad && "border-destructive/50 bg-destructive/5",
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
                          {line.is_active ? "" : " · غير مفعّل"}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-auto">
                      <div className="space-y-1">
                        <Label className="text-xs">كمية النظام</Label>
                        <div className="border-border/70 bg-card flex h-10 items-center rounded-md border px-3 text-sm tabular-nums">
                          {formatNumber(line.current_stock)}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">الكمية الفعلية</Label>
                        <Input
                          inputMode="numeric"
                          dir="ltr"
                          className={cn(
                            "h-10 w-full text-left sm:w-24",
                            bad && "border-destructive",
                          )}
                          value={line.actual}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((l) =>
                                l.variant_id === line.variant_id
                                  ? { ...l, actual: event.target.value }
                                  : l,
                              ),
                            )
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">الفرق</Label>
                        <div className="border-border/70 bg-card flex h-10 items-center rounded-md border px-3 text-sm">
                          {hasCount && !bad ? (
                            <DifferenceBadge value={difference} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
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

                  {bad ? (
                    <p className="text-destructive mt-2 text-xs font-medium">
                      الكمية الفعلية غير صحيحة.
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>سبب التعديل</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adj_reason">السبب</Label>
              <Select
                value={reason}
                onValueChange={(value) =>
                  setReason(value as InventoryAdjustmentReason)
                }
              >
                <SelectTrigger id="adj_reason" className="h-11 w-full sm:max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_REASONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {ADJUSTMENT_REASON_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adj_notes">ملاحظات</Label>
              <Textarea
                id="adj_notes"
                rows={3}
                value={notes}
                placeholder="ملاحظات على هذا التعديل."
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
            <SummaryRow label="منتجات مجرودة" value={formatNumber(counted.length)} />
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">إجمالي الزيادة</span>
              <DifferenceBadge value={increase} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">إجمالي النقص</span>
              <DifferenceBadge value={-decrease} />
            </div>

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
                  <ClipboardList className="size-4" />
                  حفظ التعديل
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <VariantPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        chosen={lines.map((l) => l.variant_id)}
        onSelect={(variant) =>
          setLines((current) =>
            current.some((l) => l.variant_id === variant.variant_id)
              ? current
              : [...current, { ...variant, actual: "", note: "" }],
          )
        }
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="تأكيد تعديل المخزون؟"
        description="سيتم تسجيل فرق الكمية في حركة المخزون."
        confirmLabel="تأكيد وحفظ"
        onConfirm={submit}
      />
    </div>
  );
}

function VariantPicker({
  open,
  onOpenChange,
  onSelect,
  chosen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (variant: CountableVariant) => void;
  chosen: string[];
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CountableVariant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchCountableVariantsAction(search);
        if (result.ok && result.data) setResults(result.data.variants);
        setLoaded(true);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [search, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setSearch("");
          setResults([]);
          setLoaded(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>اختيار منتج للجرد</DialogTitle>
          <DialogDescription>
            ابحث بالاسم أو رقم SKU. تظهر الموديلات غير المفعّلة أيضاً لأنها قد
            تكون موجودة على الرف.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث عن منتج..."
            className="h-11 pe-9"
          />
        </div>

        <div className=" max-h-[26rem] space-y-2 overflow-y-auto">
          {isPending && !loaded ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
              <LoaderCircle className="size-4 animate-spin" />
              جاري البحث...
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              compact
              icon={PackageSearch}
              title="لا توجد نتائج"
              description="جرّب اسماً أو رقم SKU آخر."
            />
          ) : (
            results.map((variant) => {
              const already = chosen.includes(variant.variant_id);
              return (
                <button
                  key={variant.variant_id}
                  type="button"
                  disabled={already}
                  onClick={() => {
                    onSelect(variant);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "border-border/70 flex w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors",
                    already
                      ? "cursor-not-allowed opacity-50"
                      : "hover:border-primary/40 hover:bg-accent/50",
                  )}
                >
                  <ProductThumb
                    url={variant.image_url}
                    alt={variant.product_name}
                    className="size-12"
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate font-medium">{variant.product_name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      <bdi>{variant.sku}</bdi>
                      {variant.color ? ` · ${variant.color}` : ""}
                      {variant.size ? ` · ${variant.size}` : ""}
                    </p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-sm">
                    النظام {formatNumber(variant.current_stock)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
