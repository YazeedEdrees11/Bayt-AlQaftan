import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PURCHASE_STATUS_LABELS,
  type PaymentStatus,
  type PurchasePaymentMethod,
  type PurchaseStatus,
} from "@/types/purchasing";

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  PAID: "bg-success/10 text-success border-success/25",
  PARTIALLY_PAID: "bg-gold/15 text-warning-foreground border-gold/35",
  UNPAID: "bg-destructive/10 text-destructive border-destructive/25",
};

const PURCHASE_STATUS_STYLES: Record<PurchaseStatus, string> = {
  COMPLETED: "bg-primary/10 text-primary border-primary/20",
  DRAFT: "bg-muted text-muted-foreground border-border",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/25",
};

export function PaymentStatusBadge({
  status,
  className,
}: {
  status: PaymentStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-medium",
        PAYMENT_STATUS_STYLES[status],
        className,
      )}
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
      {PAYMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PurchaseStatusBadge({
  status,
  className,
}: {
  status: PurchaseStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", PURCHASE_STATUS_STYLES[status], className)}
    >
      {PURCHASE_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PaymentMethodBadge({
  method,
  className,
}: {
  method: PurchasePaymentMethod;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn("font-medium", className)}>
      {PAYMENT_METHOD_LABELS[method]}
    </Badge>
  );
}
