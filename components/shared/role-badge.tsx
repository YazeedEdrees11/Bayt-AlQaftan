import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/permissions/roles";
import { cn } from "@/lib/utils/cn";
import type { UserRole } from "@/types/auth";

const ROLE_STYLES: Record<UserRole, string> = {
  ADMIN: "bg-primary/10 text-primary border-primary/20",
  MANAGER: "bg-gold/15 text-warning-foreground border-gold/30",
  STAFF: "bg-muted text-muted-foreground border-border",
};

/** Role chip used in the header, the user table and the profile page. */
export function RoleBadge({
  role,
  className,
}: {
  role: UserRole;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", ROLE_STYLES[role], className)}
    >
      {ROLE_LABELS[role]}
    </Badge>
  );
}

/** Active / inactive chip. */
export function StatusBadge({
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
        "gap-1.5 font-medium",
        isActive
          ? "bg-success/10 text-success border-success/25"
          : "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          isActive ? "bg-success" : "bg-muted-foreground/60",
        )}
      />
      {isActive ? "نشط" : "غير نشط"}
    </Badge>
  );
}
