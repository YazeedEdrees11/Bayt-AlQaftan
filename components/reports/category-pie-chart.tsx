"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { formatMoney } from "@/lib/utils/format";

export interface CategoryPoint {
  name: string;
  value: number;
  color: string;
}

const mockData: CategoryPoint[] = [
  { name: "قفاطين", value: 45000, color: "var(--chart-1)" },
  { name: "جلابيات", value: 25000, color: "var(--chart-2)" },
  { name: "عبايات", value: 15000, color: "var(--chart-3)" },
  { name: "إكسسوارات", value: 5000, color: "var(--chart-4)" },
  { name: "أخرى", value: 2000, color: "var(--chart-5)" },
];

export function CategoryPieChart({ data = mockData }: { data?: CategoryPoint[] }) {
  return (
    <div className="flex h-[300px] w-full flex-col md:flex-row items-center justify-center gap-8" dir="ltr">
      <div className="h-full w-full max-w-[200px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded-lg border bg-background p-3 shadow-sm" dir="rtl">
                      <p className="mb-1 text-sm text-muted-foreground">{payload[0].name}</p>
                      <p className="font-semibold text-primary">
                        {formatMoney(payload[0].value as number)}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-col gap-3" dir="rtl">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-3">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-sm font-medium">{item.name}</span>
            <span className="text-muted-foreground text-sm flex-1 text-left tabular-nums">
              {formatMoney(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
