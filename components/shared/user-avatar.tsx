import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";

/**
 * First letters of the first two words — a readable Arabic monogram.
 *
 * The definite article «ال» is stripped first: without that, half the names in
 * the shop ("أحمد الغامدي") collapse to the meaningless «أا».
 */
export function getInitials(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length > 2 && word.startsWith("ال") ? word.slice(2) : word))
    .filter(Boolean);

  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[1][0]}`;
}

export function UserAvatar({
  fullName,
  avatarUrl,
  className,
}: {
  fullName: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-9", className)}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName} /> : null}
      <AvatarFallback className="bg-accent text-accent-foreground text-xs font-semibold">
        {getInitials(fullName)}
      </AvatarFallback>
    </Avatar>
  );
}
