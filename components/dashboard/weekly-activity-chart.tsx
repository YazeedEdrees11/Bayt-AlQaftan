"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/shared/empty-state";
import { ChartNoAxesColumn } from "lucide-react";

export interface WeeklyPoint {
  /** Arabic day label. */
  day: string;
  /** Sales total for that day. */
  total: number;
}

/**
 * Weekly sales chart.
 *
 * The Sales module ships in a later phase, so `data` is empty today and the
 * card states that plainly instead of drawing an invented trend. Pass real
 * points in once sales exist and the chart takes over.
 */
export function WeeklyActivityChart({ data = [] }: { data?: WeeklyPoint[] }) {
  const hasData = data.some((point) => point.total > 0);

  if (!hasData) {
    return (
      <div className="border-border/70 bg-muted/25 flex h-[260px] w-full items-center justify-center rounded-xl border border-dashed">
        <EmptyState
          compact
          icon={ChartNoAxesColumn}
          title="لا توجد بيانات بعد"
          description="ستظهر حركة المبيعات هنا بعد تفعيل قسم المبيعات."
        />
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          barCategoryGap="28%"
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="4 6"
          />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            reversed
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            dy={6}
          />
          <YAxis
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={40}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <Bar
            dataKey="total"
            fill="var(--chart-1)"
            radius={[999, 999, 6, 6]}
            maxBarSize={38}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
