"use client";

import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, PackageSearch, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductThumb } from "@/components/catalog/product-thumb";
import { StockBadge } from "@/components/catalog/stock-badge";
import { searchVariantsAction } from "@/app/actions/purchases";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { PurchasableVariant } from "@/types/purchasing";

/**
 * Searchable variant picker for purchase lines.
 *
 * Queries the server as the user types (name, SKU or barcode) so the catalog
 * is never shipped to the browser. Variants already on the invoice are shown
 * but not selectable.
 */
export function VariantPickerDialog({
  open,
  onOpenChange,
  onSelect,
  excludeIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (variant: PurchasableVariant) => void;
  excludeIds: string[];
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PurchasableVariant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchVariantsAction(search);
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
          <DialogTitle>اختيار منتج</DialogTitle>
          <DialogDescription>
            ابحث بالاسم أو رقم SKU أو الباركود.
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
              description="جرّب اسماً أو رقم SKU آخر. الموديلات غير المفعّلة لا تظهر هنا."
            />
          ) : (
            results.map((variant) => {
              const already = excludeIds.includes(variant.variant_id);

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
                    <p className="truncate font-medium">
                      {variant.product_name}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      <bdi>{variant.sku}</bdi>
                      {variant.color ? ` · ${variant.color}` : ""}
                      {variant.size ? ` · ${variant.size}` : ""}
                    </p>
                  </div>

                  <div className="shrink-0 space-y-1 text-end">
                    <p className="text-sm font-medium">
                      {formatMoney(variant.purchase_price)}
                    </p>
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="text-muted-foreground text-xs">
                        المخزون {formatNumber(variant.current_stock)}
                      </span>
                      <StockBadge stock={variant.current_stock} />
                    </div>
                  </div>

                  {already ? (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      مضاف
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
