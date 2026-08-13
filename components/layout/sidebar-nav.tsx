"use client";

import Link from "next/link";

import { APP_NAME } from "@/lib/constants";
import { APP_VERSION } from "@/lib/version";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import {
  getVisibleNavSections,
  SETTINGS_NAV_ITEM,
  type NavItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils/cn";
import type { UserProfile } from "@/types/auth";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: Pick<NavItem, "label" | "href" | "icon">;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
      )}
    >
      {/* Active marker sits on the inline-start edge, which is the right in RTL. */}
      <span
        aria-hidden
        className={cn(
          "bg-sidebar-primary absolute inset-y-1.5 -start-3 w-1 rounded-full transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon
        className={cn("size-[1.15rem] shrink-0", active && "text-sidebar-primary")}
        strokeWidth={active ? 2.1 : 1.8}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * Sidebar contents. Menu entries are filtered by permission here for a clean
 * UI only — every route re-checks the same permission on the server.
 */
export function SidebarNav({
  profile,
  onNavigate,
}: {
  profile: Pick<UserProfile, "role" | "is_active">;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sections = getVisibleNavSections(profile);

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="px-3 pt-1">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="rounded-xl focus-visible:ring-ring inline-flex focus-visible:ring-2 focus-visible:outline-none"
        >
          <Logo />
        </Link>
      </div>

      <nav className=" flex-1 space-y-6 overflow-y-auto px-3">
        {sections.map((section) => (
          <div key={section.title ?? "main"} className="space-y-1">
            {section.title ? (
              <p className="text-muted-foreground/70 px-3 pb-1 text-[0.68rem] font-semibold tracking-wider uppercase">
                {section.title}
              </p>
            ) : null}
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(pathname, item.href)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}

        <div className="space-y-1">
          <p className="text-muted-foreground/70 px-3 pb-1 text-[0.68rem] font-semibold tracking-wider uppercase">
            عام
          </p>
          <NavLink
            item={SETTINGS_NAV_ITEM}
            active={isActive(pathname, SETTINGS_NAV_ITEM.href)}
            onNavigate={onNavigate}
          />
        </div>
      </nav>

      <div className="px-3 pb-1">
        <div className="from-primary to-primary/85 text-primary-foreground relative overflow-hidden rounded-2xl bg-gradient-to-bl p-4">
          <div
            aria-hidden
            className="absolute -start-6 -bottom-10 size-28 rounded-full bg-white/10"
          />
          <div
            aria-hidden
            className="absolute -end-8 -top-10 size-24 rounded-full bg-white/5"
          />
          {/*
            * This card used to announce the development phase — «المرحلة
            * الثامنة», and «المرحلة الرابعة» before that, both left behind by
            * the phase that followed. A shop assistant has no idea what a phase
            * is, and any banner keyed to one is stale the week after it ships.
            *
            * The version is the durable thing to put here: it means nothing on
            * an ordinary day and is the first question anyone asks when
            * something is wrong.
            */}
          <p className="relative text-sm font-semibold">{APP_NAME}</p>
          <p className="relative mt-1 text-xs leading-relaxed text-white/80">
            الإصدار <span dir="ltr">{APP_VERSION}</span> — عند الإبلاغ عن مشكلة
            اذكر هذا الرقم والرمز الظاهر في رسالة الخطأ.
          </p>
        </div>
      </div>
    </div>
  );
}
