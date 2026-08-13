import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import {
  ADJUSTMENT_REASON_LABELS,
  CONDITION_LABELS,
  EXCHANGE_DIRECTION_LABELS,
  REFUND_METHOD_LABELS,
  REFUND_STATUS_LABELS,
  RETURN_REASON_LABELS,
  RETURN_STATUS_LABELS,
  SETTLEMENT_METHOD_LABELS,
  type ExchangeDirection,
  type InventoryAdjustmentReason,
  type InventoryItemCondition,
  type RefundMethod,
  type RefundStatus,
  type ReturnReason,
  type ReturnStatus,
  type SettlementMethod,
} from "@/types/returns";

const STATUS_STYLES: Record<ReturnStatus, string> = {
  COMPLETED: "bg-primary/10 text-primary border-primary/20",
  DRAFT: "bg-muted text-muted-foreground border-border",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/25",
};

const REFUND_STYLES: Record<RefundStatus, string> = {
  REFUNDED: "bg-success/10 text-success border-success/25",
  PARTIAL_REFUND: "bg-gold/15 text-warning-foreground border-gold/35",
  CUSTOMER_CREDIT: "bg-primary/10 text-primary border-primary/20",
  NO_REFUND: "bg-muted text-muted-foreground border-border",
};

const REFUND_DOTS: Record<RefundStatus, string> = {
  REFUNDED: "bg-success",
  PARTIAL_REFUND: "bg-gold",
  CUSTOMER_CREDIT: "bg-primary",
  NO_REFUND: "bg-muted-foreground",
};

/** Damaged is called out in red — it must never read as ordinary stock. */
const CONDITION_STYLES: Record<InventoryItemCondition, string> = {
  GOOD: "bg-success/10 text-success border-success/25",
  DAMAGED: "bg-destructive/10 text-destructive border-destructive/25",
};

const DIRECTION_STYLES: Record<ExchangeDirection, string> = {
  CUSTOMER_PAYS: "bg-success/10 text-success border-success/25",
  CUSTOMER_RECEIVES: "bg-gold/15 text-warning-foreground border-gold/35",
  EVEN: "bg-muted text-muted-foreground border-border",
};

export function ReturnStatusBadge({
  status,
  className,
}: {
  status: ReturnStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("font-medium", STATUS_STYLES[status], className)}>
      {RETURN_STATUS_LABELS[status]}
    </Badge>
  );
}

export function RefundStatusBadge({
  status,
  className,
}: {
  status: RefundStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", REFUND_STYLES[status], className)}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", REFUND_DOTS[status])} />
      {REFUND_STATUS_LABELS[status]}
    </Badge>
  );
}

export function ConditionBadge({
  condition,
  className,
}: {
  condition: InventoryItemCondition;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", CONDITION_STYLES[condition], className)}
    >
      {CONDITION_LABELS[condition]}
    </Badge>
  );
}

export function ReturnReasonBadge({
  reason,
  className,
}: {
  reason: ReturnReason | null;
  className?: string;
}) {
  if (!reason) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <Badge variant="outline" className={cn("font-normal", className)}>
      {RETURN_REASON_LABELS[reason]}
    </Badge>
  );
}

export function RefundMethodBadge({
  method,
  className,
}: {
  method: RefundMethod;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("font-normal", className)}>
      {REFUND_METHOD_LABELS[method]}
    </Badge>
  );
}

export function SettlementMethodBadge({
  method,
  className,
}: {
  method: SettlementMethod | null;
  className?: string;
}) {
  if (!method) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <Badge variant="outline" className={cn("font-normal", className)}>
      {SETTLEMENT_METHOD_LABELS[method]}
    </Badge>
  );
}

export function ExchangeDirectionBadge({
  direction,
  className,
}: {
  direction: ExchangeDirection;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", DIRECTION_STYLES[direction], className)}
    >
      {EXCHANGE_DIRECTION_LABELS[direction]}
    </Badge>
  );
}

export function AdjustmentReasonBadge({
  reason,
  className,
}: {
  reason: InventoryAdjustmentReason;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("font-normal", className)}>
      {ADJUSTMENT_REASON_LABELS[reason]}
    </Badge>
  );
}

/** A signed quantity difference: green up, red down, muted zero. */
export function DifferenceBadge({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const n = Number(value);
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        n > 0 && "text-success",
        n < 0 && "text-destructive",
        n === 0 && "text-muted-foreground",
        className,
      )}
    >
      {n > 0 ? "+" : ""}
      {n}
    </span>
  );
}

export function WalkInCell({ name }: { name: string | null }) {
  if (name) return <span>{name}</span>;
  return <span className="text-muted-foreground text-sm">زبون عابر</span>;
}
