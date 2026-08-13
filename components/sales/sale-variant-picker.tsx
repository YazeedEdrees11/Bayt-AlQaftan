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
import { searchSellableVariantsAction } from "@/app/actions/sales";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { SellableVariant } from "@/types/sales";

/**
 * Product lookup for the till.
 *
 * Anything with no stock is shown but not selectable — the cashier can see it
 * exists and is simply out, rather than wondering why the search found nothing.
 */
export function SaleVariantPicker({
  open,
  onOpenChange,
  onSelect,
  inBasket,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (variant: SellableVariant) => void;
  /** variant_id -> quantity already on this sale. */
  inBasket: Record<string, number>;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SellableVariant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchSellableVariantsAction(search);
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
              description="جرّب اسماً أو رقم SKU آخر."
            />
          ) : (
            results.map((variant) => {
              const already = inBasket[variant.variant_id] ?? 0;
              const remaining = variant.current_stock - already;
              const unavailable = remaining <= 0;

              return (
                <button
                  key={variant.variant_id}
                  type="button"
                  disabled={unavailable}
                  onClick={() => {
                    onSelect(variant);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "border-border/70 flex w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors",
                    unavailable
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

                  <div className="shrink-0 space-y-1 text-end">
                    <p className="text-sm font-medium">
                      {formatMoney(variant.selling_price)}
                    </p>
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="text-muted-foreground text-xs">
                        المتوفر {formatNumber(remaining)}
                      </span>
                      <StockBadge stock={remaining} />
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
