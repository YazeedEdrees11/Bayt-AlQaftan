import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Banknote,
  Bell,
  Boxes,
  ClipboardList,
  Coins,
  FileText,
  Hash,
  Receipt,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  UserCog,
  Users,
} from "lucide-react";

import type { Permission } from "@/types/auth";

/**
 * The settings navigation (§2), which is also the search index (§77).
 *
 * `keywords` is what makes searching "خصم" land on the sales page: the terms a
 * shopkeeper would actually type, not the setting keys. Keeping them beside the
 * route means a page and the words that find it cannot drift apart.
 */
export type SettingsNavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  permission: Permission;
  keywords: string[];
};

export type SettingsNavSection = {
  title: string;
  items: SettingsNavItem[];
};

export const SETTINGS_NAV: SettingsNavSection[] = [
  {
    title: "حسابي",
    items: [
      {
        href: "/settings/profile",
        label: "الملف الشخصي",
        description: "اسمك وصورتك وكلمة المرور.",
        icon: UserCog,
        // Everyone has an account, so everyone has this one.
        permission: "VIEW_DASHBOARD",
        keywords: ["ملف", "حساب", "كلمة المرور", "اسم", "صورة"],
      },
    ],
  },
  {
    title: "المحل",
    items: [
      {
        href: "/settings/store",
        label: "بيانات المحل",
        description: "الاسم والشعار والعنوان والعملة والمنطقة الزمنية.",
        icon: Store,
        permission: "MANAGE_SETTINGS",
        keywords: ["اسم", "شعار", "لوجو", "هاتف", "عنوان", "عملة", "دينار", "توقيت", "تاريخ", "مدينة"],
      },
      {
        href: "/settings/receipts",
        label: "الإيصالات",
        description: "ما يظهر على الإيصال المطبوع ونص التذييل.",
        icon: Receipt,
        permission: "MANAGE_SETTINGS",
        keywords: ["إيصال", "فاتورة", "طباعة", "تذييل", "سياسة الاسترجاع", "شعار"],
      },
      {
        href: "/settings/numbering",
        label: "ترقيم المستندات",
        description: "بادئة أرقام الفواتير والمرتجعات والمصاريف.",
        icon: Hash,
        permission: "MANAGE_SETTINGS",
        keywords: ["ترقيم", "بادئة", "رقم فاتورة", "تسلسل", "SAL", "PUR"],
      },
    ],
  },
  {
    title: "المستخدمون والصلاحيات",
    items: [
      {
        href: "/settings/users",
        label: "المستخدمون",
        description: "الدعوة والإيقاف وتغيير الأدوار.",
        icon: Users,
        permission: "MANAGE_USERS",
        keywords: ["مستخدم", "موظف", "دعوة", "إيقاف", "تفعيل", "حساب", "بريد"],
      },
      {
        href: "/settings/roles",
        label: "الأدوار والصلاحيات",
        description: "ما يستطيع كل دور فعله، بالتفصيل.",
        icon: ShieldCheck,
        permission: "MANAGE_SETTINGS",
        keywords: ["صلاحية", "دور", "مدير", "موظف", "مسؤول", "أذونات", "خصم"],
      },
    ],
  },
  {
    title: "قواعد العمل",
    items: [
      {
        href: "/settings/business",
        label: "الإعدادات العامة",
        description: "طرق الدفع والحسابات الافتراضية.",
        icon: Coins,
        permission: "MANAGE_SETTINGS",
        keywords: ["افتراضي", "طريقة دفع", "نقدي", "بنك", "حساب", "تصنيف مصاريف"],
      },
      {
        href: "/settings/inventory",
        label: "المخزون",
        description: "الحد الأدنى والمخزون السالب والتالف والتعديلات.",
        icon: Boxes,
        permission: "MANAGE_SETTINGS",
        keywords: ["مخزون", "حد أدنى", "سالب", "تالف", "تعديل", "جرد", "سبب"],
      },
      {
        href: "/settings/sales",
        label: "المبيعات",
        description: "الخصم والعميل الآجل والإلغاء.",
        icon: ShoppingBag,
        permission: "MANAGE_SETTINGS",
        keywords: ["خصم", "بيع", "فاتورة", "آجل", "عميل عابر", "إلغاء", "حد أقصى"],
      },
      {
        href: "/settings/purchases",
        label: "المشتريات",
        description: "المورد والاستلام الجزئي والتعديل.",
        icon: ShoppingCart,
        permission: "MANAGE_SETTINGS",
        keywords: ["شراء", "مورد", "استلام", "جزئي", "تعديل", "إلغاء"],
      },
      {
        href: "/settings/returns",
        label: "المرتجعات",
        description: "مدة الاسترجاع وطرق الاسترداد.",
        icon: RotateCcw,
        permission: "MANAGE_SETTINGS",
        keywords: ["مرتجع", "استرجاع", "استرداد", "مدة", "أيام", "رصيد عميل", "سبب"],
      },
      {
        href: "/settings/exchanges",
        label: "الاستبدالات",
        description: "مدة الاستبدال وفروق السعر.",
        icon: ArrowLeftRight,
        permission: "MANAGE_SETTINGS",
        keywords: ["استبدال", "فرق", "مدة", "سبب"],
      },
      {
        href: "/settings/finance",
        label: "المالية",
        description: "الأرصدة السالبة والإيصالات والتسويات.",
        icon: Banknote,
        permission: "MANAGE_SETTINGS",
        keywords: ["مالية", "رصيد سالب", "إيصال", "مصروف", "تسوية", "تحويل"],
      },
      {
        href: "/settings/reports",
        label: "التقارير",
        description: "الفترة الافتراضية وما يظهر في لوحة الإدارة.",
        icon: FileText,
        permission: "MANAGE_SETTINGS",
        keywords: ["تقرير", "فترة", "تصدير", "صفوف", "أرباح", "ذمم", "لوحة"],
      },
    ],
  },
  {
    title: "النظام",
    items: [
      {
        href: "/settings/notifications",
        label: "التنبيهات",
        description: "أي التنبيهات تعمل، وعند أي حد.",
        icon: Bell,
        permission: "MANAGE_SETTINGS",
        keywords: ["تنبيه", "إشعار", "حد", "مخزون منخفض", "ذمم", "فرق الصندوق"],
      },
      {
        href: "/settings/audit-log",
        label: "سجل النشاط",
        description: "من فعل ماذا، ومتى.",
        icon: ClipboardList,
        permission: "VIEW_AUDIT_LOG",
        keywords: ["سجل", "نشاط", "تدقيق", "من عدّل", "تاريخ", "عمليات"],
      },
      {
        href: "/settings/data",
        label: "البيانات",
        description: "إحصائيات قاعدة البيانات.",
        icon: ServerCog,
        permission: "MANAGE_SETTINGS",
        keywords: ["بيانات", "إحصائيات", "عدد", "قاعدة البيانات", "حجم"],
      },
      {
        href: "/settings/system/integrity",
        label: "سلامة البيانات",
        description: "فحوصات تشخيصية ومطابقة مالية.",
        icon: ShieldCheck,
        permission: "MANAGE_SETTINGS",
        keywords: ["سلامة", "فحص", "تشخيص", "مطابقة", "أرصدة", "يتيم", "مكرر"],
      },
      {
        href: "/settings/system/readiness",
        label: "جاهزية الإنتاج",
        description: "هل النظام جاهز للعمل الحقيقي.",
        icon: ShieldCheck,
        permission: "MANAGE_SETTINGS",
        keywords: ["جاهزية", "إنتاج", "نشر", "أمان", "نسخ احتياطي", "مراقبة"],
      },
      {
        href: "/settings/system",
        label: "النظام",
        description: "الإصدار والبيئة وحالة النسخ الاحتياطي.",
        icon: ServerCog,
        permission: "MANAGE_SETTINGS",
        keywords: ["إصدار", "نسخة", "بيئة", "صيانة", "نسخ احتياطي", "حالة", "صحة"],
      },
    ],
  },
];

export const ALL_SETTINGS_ITEMS: SettingsNavItem[] = SETTINGS_NAV.flatMap((s) => s.items);

/** Ranked matches for the settings search (§77). */
export function searchSettingsNav(
  query: string,
  items: SettingsNavItem[] = ALL_SETTINGS_ITEMS,
): SettingsNavItem[] {
  const term = query.trim();
  if (term.length === 0) return [];

  return items
    .map((item) => {
      const label = item.label.includes(term) ? 3 : 0;
      const keyword = item.keywords.some((k) => k.includes(term) || term.includes(k)) ? 2 : 0;
      const description = item.description.includes(term) ? 1 : 0;
      return { item, score: label + keyword + description };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((match) => match.item);
}
