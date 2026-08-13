import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, PackageX } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSettingBool } from "@/lib/settings/queries";
import { requirePermission } from "@/lib/auth/require-auth";
import { listDamagedStock } from "@/lib/returns/queries";
import { normalizePage, normalizePageSize } from "@/lib/catalog/config";
import { formatMoney, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = { title: "المخزون التالف" };

export default async function DamagedStockPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; perPage?: string }>;
}) {
  await requirePermission("VIEW_INVENTORY");

  // §22. When the shop does not track damaged stock, the workflow is not
  // offered. The records already written stay exactly where they are — they are
  // real movements and the inventory reports still account for them.
  if (!(await getSettingBool("track_damaged_stock", true))) {
    notFound();
  }
  const params = await searchParams;

  const data = await listDamagedStock({
    page: normalizePage(params.page),
    perPage: normalizePageSize(params.perPage),
  });

  const totalUnits = data.rows.reduce((sum, row) => sum + row.damaged_quantity, 0);
  const totalValue = data.rows.reduce(
    (sum, row) => sum + row.damaged_quantity * Number(row.purchase_price),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="المخزون التالف"
        description="قطع مسجّلة كتالفة — محسوبة ومحفوظة، ولا تظهر كمخزون قابل للبيع."
        actions={
          <Button asChild variant="outline">
            <Link href="/inventory">
              <ChevronRight className="size-4" />
              رجوع للمخزون
            </Link>
          </Button>
        }
      />

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>القطع التالفة</CardTitle>
          <CardDescription>
            التالف لا يُخلط بالمخزون المتاح: هو رصيد منفصل في نفس السجل، فلا
            يمكن بيعه ولا يختفي من الحسابات.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {data.rows.length === 0 ? (
            <EmptyState
              icon={PackageX}
              title="لا يوجد مخزون تالف"
              description="لم يتم تسجيل أي قطعة تالفة حتى الآن."
            />
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-start">المنتج</TableHead>
                      <TableHead className="text-start">SKU</TableHead>
                      <TableHead className="text-start">اللون</TableHead>
                      <TableHead className="text-start">المقاس</TableHead>
                      <TableHead className="text-start">الكمية التالفة</TableHead>
                      <TableHead className="text-start">المتاح للبيع</TableHead>
                      <TableHead className="text-start">قيمة التالف</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {data.rows.map((row) => (
                      <TableRow key={row.variant_id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/products/${row.product_id}/variants/${row.variant_id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {row.product_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          <bdi className="block text-right">{row.sku}</bdi>
                        </TableCell>
                        <TableCell className="text-sm">{row.color ?? "—"}</TableCell>
                        <TableCell className="text-sm">{row.size ?? "—"}</TableCell>
                        <TableCell className="text-destructive text-sm font-medium tabular-nums">
                          {formatNumber(row.damaged_quantity)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {formatNumber(row.available_quantity)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatMoney(row.damaged_quantity * Number(row.purchase_price))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="border-border/70 flex flex-wrap justify-end gap-6 border-t p-4 text-sm">
                <span className="text-muted-foreground">
                  إجمالي القطع التالفة{" "}
                  <span className="text-destructive font-medium">
                    {formatNumber(totalUnits)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  قيمتها بسعر الشراء{" "}
                  <span className="text-foreground font-medium">
                    {formatMoney(totalValue)}
                  </span>
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
