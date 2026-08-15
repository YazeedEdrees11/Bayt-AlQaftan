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

import { formatMoney } from "@/lib/utils/format";

export interface RevenuePoint {
  month: string;
  revenue: number;
}

const mockData: RevenuePoint[] = [
  { month: "يناير", revenue: 15000 },
  { month: "فبراير", revenue: 18500 },
  { month: "مارس", revenue: 14200 },
  { month: "أبريل", revenue: 22000 },
  { month: "مايو", revenue: 28500 },
  { month: "يونيو", revenue: 26000 },
  { month: "يوليو", revenue: 32000 },
  { month: "أغسطس", revenue: 38500 },
];

export function RevenueChart({ data = mockData }: { data?: RevenuePoint[] }) {
  return (
    <div className="h-[300px] w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
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
            tickFormatter={(value) => `${value / 1000}k`}
            dx={-10}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="rounded-lg border bg-background p-3 shadow-sm" dir="rtl">
                    <p className="mb-1 text-sm text-muted-foreground">{label}</p>
                    <p className="font-semibold text-primary">
                      {formatMoney(payload[0].value as number)}
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--chart-1)"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorRevenue)"
            activeDot={{ r: 6, strokeWidth: 0, fill: "var(--chart-1)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
