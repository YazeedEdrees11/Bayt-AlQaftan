"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";

import { MobileSidebar } from "./mobile-sidebar";
import { UserMenu } from "./user-menu";
import { RoleBadge } from "@/components/shared/role-badge";
import { Separator } from "@/components/ui/separator";
import { getNavTitle } from "@/lib/navigation";
import { APP_NAME } from "@/lib/constants";
import type { UserProfile } from "@/types/auth";

/** Top bar: current page on the right, identity and sign-out on the left. */
export function Header({
  profile,
  unreadNotifications = 0,
  showNotifications = false,
}: {
  profile: UserProfile;
  /** Unread count, resolved on the server. -1 is never shown. */
  unreadNotifications?: number;
  showNotifications?: boolean;
}) {
  const pathname = usePathname();
  const title = getNavTitle(pathname) ?? APP_NAME;

  return (
    <header className="bg-card border-border/70 flex h-16 shrink-0 items-center gap-3 rounded-2xl border px-3 shadow-[0_1px_2px_0_oklch(0_0_0/0.03)] sm:px-4">
      <MobileSidebar profile={profile} />

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <h2 className="truncate text-base font-semibold tracking-tight">
          {title}
        </h2>
        <Separator orientation="vertical" className="hidden !h-5 sm:block" />
        <RoleBadge role={profile.role} className="hidden sm:inline-flex" />
      </div>

      {showNotifications ? (
        <Button asChild variant="ghost" size="icon" className="relative shrink-0">
          <Link href="/notifications" aria-label={
            unreadNotifications > 0
              ? `التنبيهات، ${unreadNotifications} غير مقروء`
              : "التنبيهات"
          }>
            <Bell className="size-[1.15rem]" strokeWidth={1.8} />
            {unreadNotifications > 0 ? (
              <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -end-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[0.65rem] font-medium tabular-nums">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            ) : null}
          </Link>
        </Button>
      ) : null}

      <UserMenu profile={profile} />
    </header>
  );
}
