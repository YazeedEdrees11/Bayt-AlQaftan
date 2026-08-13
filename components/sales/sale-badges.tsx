import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import {
  SALE_PAYMENT_METHOD_LABELS,
  SALE_PAYMENT_STATUS_LABELS,
  SALE_STATUS_LABELS,
  type SalePaymentMethod,
  type SalePaymentStatus,
  type SaleStatus,
} from "@/types/sales";

const PAYMENT_STYLES: Record<SalePaymentStatus, string> = {
  PAID: "bg-success/10 text-success border-success/25",
  PARTIALLY_PAID: "bg-gold/15 text-warning-foreground border-gold/35",
  UNPAID: "bg-destructive/10 text-destructive border-destructive/25",
};

const STATUS_STYLES: Record<SaleStatus, string> = {
  COMPLETED: "bg-primary/10 text-primary border-primary/20",
  DRAFT: "bg-muted text-muted-foreground border-border",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/25",
};

export function SalePaymentStatusBadge({
  status,
  className,
}: {
  status: SalePaymentStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", PAYMENT_STYLES[status], className)}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          status === "PAID" && "bg-success",
          status === "PARTIALLY_PAID" && "bg-gold",
          status === "UNPAID" && "bg-destructive",
        )}
      />
      {SALE_PAYMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function SaleStatusBadge({
  status,
  className,
}: {
  status: SaleStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", STATUS_STYLES[status], className)}
    >
      {SALE_STATUS_LABELS[status]}
    </Badge>
  );
}

export function SaleMethodBadge({
  method,
  className,
}: {
  method: SalePaymentMethod;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn("font-medium", className)}>
      {SALE_PAYMENT_METHOD_LABELS[method]}
    </Badge>
  );
}

/** Walk-in sales have no customer row; say so rather than showing a dash. */
export function CustomerCell({ name }: { name: string | null }) {
  if (name) return <span>{name}</span>;
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
      <span aria-hidden className="bg-muted-foreground/40 size-1.5 rounded-full" />
      زبون عابر
    </span>
  );
}
