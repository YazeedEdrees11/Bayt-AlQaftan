import { Badge } from "@/components/ui/badge";
import { getStockStatus, LOW_STOCK_THRESHOLD } from "@/lib/catalog/config";
import { STOCK_STATUS_LABELS, type StockStatus } from "@/types/catalog";
import { cn } from "@/lib/utils/cn";

const STATUS_STYLES: Record<StockStatus, string> = {
  IN_STOCK: "bg-success/10 text-success border-success/25",
  LOW_STOCK: "bg-gold/15 text-warning-foreground border-gold/35",
  OUT_OF_STOCK: "bg-destructive/10 text-destructive border-destructive/25",
};

/** Turns a raw stock count into the right Arabic status chip. */
export function StockBadge({
  stock,
  threshold = LOW_STOCK_THRESHOLD,
  showCount = false,
  className,
}: {
  stock: number;
  threshold?: number;
  showCount?: boolean;
  className?: string;
}) {
  const status = getStockStatus(stock, threshold);

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", STATUS_STYLES[status], className)}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          status === "IN_STOCK" && "bg-success",
          status === "LOW_STOCK" && "bg-gold",
          status === "OUT_OF_STOCK" && "bg-destructive",
        )}
      />
      {showCount ? `${STOCK_STATUS_LABELS[status]} · ${stock}` : STOCK_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Active / inactive chip shared by products, variants and suppliers. */
export function ActiveBadge({
  isActive,
  className,
}: {
  isActive: boolean;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        isActive
          ? "bg-success/10 text-success border-success/25"
          : "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {isActive ? "نشط" : "غير نشط"}
    </Badge>
  );
}
