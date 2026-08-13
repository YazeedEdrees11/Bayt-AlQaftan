import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-auth";
import { getDataStatistics } from "@/lib/settings/queries";
import { formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = { title: "البيانات" };

const GROUPS: { title: string; rows: { key: keyof Stats; label: string }[] }[] = [
  {
    title: "الكتالوج",
    rows: [
      { key: "products", label: "المنتجات" },
      { key: "variants", label: "الموديلات" },
    ],
  },
  {
    title: "الأطراف",
    rows: [
      { key: "customers", label: "العملاء" },
      { key: "suppliers", label: "الموردون" },
    ],
  },
  {
    title: "الحركة",
    rows: [
      { key: "sales", label: "فواتير المبيعات" },
      { key: "purchases", label: "فواتير المشتريات" },
      { key: "returns", label: "المرتجعات" },
      { key: "exchanges", label: "الاستبدالات" },
      { key: "expenses", label: "المصاريف" },
    ],
  },
  {
    title: "السجلات",
    rows: [
      { key: "inventory_transactions", label: "حركات المخزون" },
      { key: "financial_transactions", label: "الحركات المالية" },
      { key: "audit_logs", label: "سجل النشاط" },
    ],
  },
];

type Stats = NonNullable<Awaited<ReturnType<typeof getDataStatistics>>>;

export default async function DataPage() {
  await requirePermission("MANAGE_SETTINGS");
  const stats = await getDataStatistics();

  return (
    <div className="space-y-6">
      <PageHeader
        title="البيانات"
        description="عدد السجلات في كل جدول. هذه الشاشة للاطلاع فقط."
      />

      <p className="border-success/30 bg-success/5 text-success flex items-start gap-2 rounded-xl border p-3 text-sm leading-relaxed">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        لا يوجد في النظام زر لحذف كل البيانات أو إعادة تهيئة قاعدة البيانات، ولن
        يُضاف. الشاشة التي تستطيع العدّ فقط لا يمكن إقناعها بفعل ما هو أسوأ.
      </p>

      {stats === null ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">تعذر قراءة الإحصائيات.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <Card key={group.title}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{group.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.rows.map((row) => (
                  <div
                    key={row.key}
                    className="border-border/70 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  >
                    <span className="text-sm">{row.label}</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatNumber(Number(stats[row.key] ?? 0))}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">النسخ الاحتياطي</CardTitle>
          <CardDescription>
            النسخ الاحتياطي يُدار من بنية الاستضافة، لا من هذه الشاشة. تفاصيله
            في شاشة النظام.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
