import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Banknote,
  Bell,
  Boxes,
  CalendarCheck,
  CalendarRange,
  ChartNoAxesColumn,
  Coins,
  HandCoins,
  Landmark,
  LayoutGrid,
  PackageX,
  Receipt,
  RotateCcw,
  Settings,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserCog,
  Users,
} from "lucide-react";

import type { Permission, UserProfile } from "@/types/auth";
import { hasPermission } from "@/lib/permissions/check-permission";

export interface NavItem {
  /** Arabic label shown in the sidebar. */
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission required to see (and reach) the item. */
  permission: Permission;
}

export interface NavSection {
  /** Arabic section heading, or `null` for an unlabelled group. */
  title: string | null;
  items: NavItem[];
}

/**
 * Sidebar definition. Adding a module later means adding one entry here —
 * visibility follows automatically from the permission matrix.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "القائمة",
    items: [
      {
        label: "الرئيسية",
        href: "/dashboard",
        icon: LayoutGrid,
        permission: "VIEW_DASHBOARD",
      },
      {
        label: "المنتجات",
        href: "/products",
        icon: Shirt,
        permission: "VIEW_PRODUCTS",
      },
      {
        label: "المخزون",
        href: "/inventory",
        icon: Boxes,
        permission: "VIEW_INVENTORY",
      },
      {
        label: "الموردين",
        href: "/suppliers",
        icon: Truck,
        permission: "VIEW_SUPPLIERS",
      },
      {
        label: "المشتريات",
        href: "/purchases",
        icon: ShoppingCart,
        permission: "VIEW_PURCHASES",
      },
      {
        label: "المبيعات",
        href: "/sales",
        icon: ShoppingBag,
        permission: "VIEW_SALES",
      },
      {
        label: "المرتجعات",
        href: "/returns",
        icon: RotateCcw,
        permission: "VIEW_RETURNS",
      },
      {
        label: "الاستبدالات",
        href: "/exchanges",
        icon: ArrowLeftRight,
        permission: "VIEW_EXCHANGES",
      },
      {
        label: "العملاء",
        href: "/customers",
        icon: Users,
        permission: "VIEW_CUSTOMERS",
      },
    ],
  },
  {
    title: "الإدارة",
    items: [
      {
        label: "المالية",
        href: "/finance",
        icon: Banknote,
        permission: "VIEW_FINANCE",
      },
      {
        label: "المصاريف",
        href: "/expenses",
        icon: Receipt,
        permission: "VIEW_EXPENSES",
      },
      {
        label: "الحسابات المالية",
        href: "/finance/accounts",
        icon: Landmark,
        permission: "VIEW_ACCOUNTS",
      },
      {
        label: "الحركات المالية",
        href: "/finance/transactions",
        icon: ArrowLeftRight,
        permission: "VIEW_FINANCIAL_TRANSACTIONS",
      },
      {
        label: "العملاء المدينون",
        href: "/finance/receivables",
        icon: HandCoins,
        permission: "VIEW_RECEIVABLES",
      },
      {
        label: "الموردون الدائنون",
        href: "/finance/payables",
        icon: Coins,
        permission: "VIEW_PAYABLES",
      },
      {
        label: "المستخدمين",
        href: "/settings/users",
        icon: UserCog,
        permission: "MANAGE_USERS",
      },
      {
        label: "التنبيهات",
        href: "/notifications",
        icon: Bell,
        permission: "VIEW_NOTIFICATIONS",
      },
    ],
  },
  {
    // The report centre lists every report; the sidebar carries only the ones
    // opened daily, so the navigation does not become a second index (§111).
    title: "التقارير",
    items: [
      {
        label: "مركز التقارير",
        href: "/reports",
        icon: ChartNoAxesColumn,
        permission: "VIEW_REPORTS",
      },
      {
        label: "تقرير المبيعات",
        href: "/reports/sales",
        icon: ShoppingBag,
        permission: "VIEW_SALES_REPORT",
      },
      {
        label: "تقرير الأرباح",
        href: "/reports/profit",
        icon: TrendingUp,
        permission: "VIEW_PROFIT_REPORT",
      },
      {
        label: "المخزون المنخفض",
        href: "/reports/inventory/low-stock",
        icon: PackageX,
        permission: "VIEW_INVENTORY_REPORT",
      },
      {
        label: "الإغلاق اليومي",
        href: "/reports/daily-closing",
        icon: CalendarCheck,
        permission: "VIEW_DAILY_CLOSING",
      },
      {
        label: "الأداء الشهري",
        href: "/reports/monthly",
        icon: CalendarRange,
        permission: "VIEW_FINANCIAL_ANALYTICS",
      },
    ],
  },
];

/**
 * الإعدادات is reachable by everyone — the personal profile lives there — so
 * it sits outside the permission-filtered sections.
 */
export const SETTINGS_NAV_ITEM: Omit<NavItem, "permission"> = {
  label: "الإعدادات",
  href: "/settings",
  icon: Settings,
};

/** Drops the sections and items the profile is not allowed to see. */
export function getVisibleNavSections(
  profile: Pick<UserProfile, "role" | "is_active">,
): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      hasPermission(profile, item.permission),
    ),
  })).filter((section) => section.items.length > 0);
}

/** Resolves the page title for the header from the current pathname. */
export function getNavTitle(pathname: string): string | null {
  if (pathname.startsWith("/settings")) return SETTINGS_NAV_ITEM.label;

  const all = NAV_SECTIONS.flatMap((section) => section.items);
  const match = all
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];

  return match?.label ?? null;
}
