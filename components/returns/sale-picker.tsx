"use client";

import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, Receipt, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { searchSalesForReturnAction } from "@/app/actions/returns";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";

export type PickedSale = {
  id: string;
  sale_number: string;
  sale_date: string;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number;
  item_count: number;
};

/**
 * Finds the original sale a return or exchange hangs off.
 *
 * Only completed sales are offered — a draft has taken no money and moved no
 * stock, and a cancelled one has already been reversed, so neither can be
 * returned against.
 */
export function SalePicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (sale: PickedSale) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PickedSale[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchSalesForReturnAction(search);
        if (result.ok && result.data) setResults(result.data.sales);
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
          <DialogTitle>اختيار عملية البيع</DialogTitle>
          <DialogDescription>
            ابحث برقم البيع أو اسم العميل أو رقم الهاتف أو المنتج.
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
            placeholder="ابحث عن عملية بيع..."
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
              icon={Receipt}
              title="لا توجد نتائج"
              description="جرّب رقم بيع أو اسم عميل آخر."
            />
          ) : (
            results.map((sale) => (
              <button
                key={sale.id}
                type="button"
                onClick={() => {
                  onSelect(sale);
                  onOpenChange(false);
                }}
                className="border-border/70 hover:border-primary/40 hover:bg-accent/50 flex w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-medium">
                    <bdi>{sale.sale_number}</bdi>
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {sale.customer_name ?? "زبون عابر"} ·{" "}
                    {formatDate(sale.sale_date)} ·{" "}
                    {formatNumber(sale.item_count)} صنف
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium">
                  {formatMoney(sale.total_amount)}
                </p>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
