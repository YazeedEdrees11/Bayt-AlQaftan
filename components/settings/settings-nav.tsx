"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import {
  SETTINGS_NAV,
  searchSettingsNav,
  type SettingsNavItem,
} from "@/lib/settings/navigation";

/**
 * The settings navigation (§74, §77).
 *
 * A rail on the desktop and a collapsible panel on a phone. The search is the
 * same list filtered, not a second index — typing «خصم» surfaces the sales page
 * because the word is one of that page's keywords.
 *
 * The server decides which routes this user may see and passes the list; the
 * definition itself lives here because each item carries an icon *component*,
 * and a function cannot cross the server/client boundary as data. This
 * component never decides who may see what — it only draws what it is told.
 */
export function SettingsNav({ allowed }: { allowed: string[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const sections = useMemo(() => {
    const permitted = new Set(allowed);
    return SETTINGS_NAV.map((section) => ({
      ...section,
      items: section.items.filter((item) => permitted.has(item.href)),
    })).filter((section) => section.items.length > 0);
  }, [allowed]);

  const items = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );
  const matches = useMemo(() => searchSettingsNav(query, items), [query, items]);
  const searching = query.trim().length > 0;

  const current = items.find((item) => pathname === item.href);

  return (
    <nav aria-label="أقسام الإعدادات" className="lg:sticky lg:top-6 lg:self-start">
      {/* On a phone the rail collapses to the current page plus a toggle. */}
      <Button
        type="button"
        variant="outline"
        className="mb-3 w-full justify-between lg:hidden"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" />
          {current?.label ?? "الإعدادات"}
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </Button>

      <div className={cn("space-y-4", !open && "hidden lg:block")}>
        <div className="relative">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث في الإعدادات…"
            aria-label="ابحث في الإعدادات"
            className="pe-9"
          />
        </div>

        {searching ? (
          matches.length === 0 ? (
            <p className="text-muted-foreground px-1 py-6 text-center text-sm">
              لا توجد نتائج لـ «{query.trim()}».
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-muted-foreground px-1 text-xs">
                {matches.length} نتيجة
              </p>
              {matches.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                  onNavigate={() => setOpen(false)}
                  showDescription
                />
              ))}
            </div>
          )
        ) : (
          sections.map((section) => (
            <div key={section.title} className="space-y-1">
              <p className="text-muted-foreground px-1 pt-1 text-xs font-medium">
                {section.title}
              </p>
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </nav>
  );
}

function NavLink({
  item,
  active,
  onNavigate,
  showDescription = false,
}: {
  item: SettingsNavItem;
  active: boolean;
  onNavigate: () => void;
  showDescription?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
        active
          ? "bg-accent text-accent-foreground font-medium"
          : "hover:bg-accent/50 text-foreground",
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
      <span className="min-w-0">
        <span className="block truncate">{item.label}</span>
        {showDescription ? (
          <span className="text-muted-foreground block text-xs leading-relaxed">
            {item.description}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
