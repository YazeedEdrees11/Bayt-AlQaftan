import type { Metadata } from "next";
import { ClipboardList, Lock } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { AuditFilters } from "@/components/settings/audit-filters";
import { AuditRow } from "@/components/settings/audit-row";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/require-auth";
import { listAuditActions, searchAuditLogs } from "@/lib/settings/queries";

export const metadata: Metadata = { title: "سجل النشاط" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; action?: string; from?: string; to?: string; page?: string;
  }>;
}) {
  await requirePermission("VIEW_AUDIT_LOG");
  const params = await searchParams;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const [data, actions] = await Promise.all([
    searchAuditLogs({
      search: params.q,
      action: params.action && params.action !== "ALL" ? params.action : undefined,
      from: params.from && ISO_DATE.test(params.from) ? params.from : undefined,
      to: params.to && ISO_DATE.test(params.to) ? params.to : undefined,
      page,
      perPage: 50,
    }),
    listAuditActions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل النشاط"
        description="من فعل ماذا، ومتى. السجل يُكتب ولا يُعدَّل ولا يُحذف — لا من هنا ولا من أي شاشة أخرى."
        actions={<AuditFilters actions={actions} />}
      />

      <p className="border-border/70 bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-xl border p-3 text-sm leading-relaxed">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
        لا يوجد زر حذف في هذه الشاشة عن قصد. سجل يمكن تعديله ليس دليلاً على شيء.
      </p>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>
            {data.total > 0 ? `${data.total} عملية` : "العمليات"}
          </CardTitle>
          <CardDescription>
            افتح أي صف لرؤية ما تغيّر: القيمة السابقة والقيمة الجديدة.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {data.rows.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="لا توجد عمليات"
              description="لا توجد عمليات مطابقة للفلاتر المحددة."
            />
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader className="bg-card sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10" />
                      <TableHead className="text-start">التاريخ</TableHead>
                      <TableHead className="text-start">المستخدم</TableHead>
                      <TableHead className="text-start">العملية</TableHead>
                      <TableHead className="text-start">النوع</TableHead>
                      <TableHead className="text-start">الوصف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((row) => (
                      <AuditRow key={row.id} row={row} />
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="border-border/70 flex flex-wrap items-center justify-end gap-4 border-t p-4 text-sm">
                <span className="text-muted-foreground">
                  صفحة {data.page} من {data.totalPages}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
