"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface LowStockPoint {
  name: string;
  stock: number;
}

const mockData: LowStockPoint[] = [
  { name: "قفطان مغربي مطرز", stock: 2 },
  { name: "جلابية قطن مريحة", stock: 3 },
  { name: "عباية سوداء بكسرات", stock: 5 },
  { name: "فستان سهرة دانتيل", stock: 7 },
  { name: "وشاح حرير أزرق", stock: 8 },
];

export function LowStockChart({ data = mockData }: { data?: LowStockPoint[] }) {
  return (
    <div className="h-[250px] w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 0, left: 10, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            stroke="var(--border)"
          />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            dataKey="name"
            type="category"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--foreground)", fontSize: 11 }}
            width={120}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="rounded-lg border bg-background p-3 shadow-sm" dir="rtl">
                    <p className="mb-1 text-sm font-medium">{payload[0].payload.name}</p>
                    <p className="text-sm text-destructive font-semibold">
                      متبقي: {payload[0].value} قطعة
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar
            dataKey="stock"
            fill="var(--destructive)"
            radius={[0, 4, 4, 0]}
            barSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
