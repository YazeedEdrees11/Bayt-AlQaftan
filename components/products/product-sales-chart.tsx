"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ProductSalesPoint {
  month: string;
  sales: number;
}

const mockData: ProductSalesPoint[] = [
  { month: "يناير", sales: 120 },
  { month: "فبراير", sales: 150 },
  { month: "مارس", sales: 110 },
  { month: "أبريل", sales: 220 },
  { month: "مايو", sales: 180 },
  { month: "يونيو", sales: 250 },
];

export function ProductSalesChart({ data = mockData }: { data?: ProductSalesPoint[] }) {
  return (
    <div className="h-[250px] w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--border)"
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            dy={10}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            dx={-10}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="rounded-lg border bg-background p-3 shadow-sm" dir="rtl">
                    <p className="mb-1 text-sm text-muted-foreground">{label}</p>
                    <p className="font-semibold text-primary">
                      {payload[0].value} قطعة
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="sales"
            stroke="var(--chart-3)"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorSales)"
            activeDot={{ r: 6, strokeWidth: 0, fill: "var(--chart-3)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
