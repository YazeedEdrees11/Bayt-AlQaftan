"use client";

import { useMemo, useState, useTransition } from "react";
import { LoaderCircle, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { updateAlertThresholdsAction } from "@/app/actions/settings";
import { cn } from "@/lib/utils/cn";
import type { ReportSettings } from "@/types/reports";

type Field = {
  key: keyof ReportSettings & string;
  label: string;
  hint: string;
  suffix: string;
  min: number;
  max: number;
};

/**
 * The five alert thresholds (§43).
 *
 * These are the numbers `get_management_alerts` compares against, and they have
 * lived in `report_settings` since Phase 7. The screen writes to them there
 * rather than copying them into `system_settings`, because a threshold with two
 * homes is a threshold that will eventually disagree with itself.
 */
const FIELDS: Field[] = [
  {
    key: "customer_debt_threshold",
    label: "حد ذمم العميل",
    hint: "يُرفع تنبيه عن كل عميل يتجاوز رصيده هذا المبلغ.",
    suffix: "د.أ",
    min: 0,
    max: 1_000_000,
  },
  {
    key: "supplier_debt_threshold",
    label: "حد ذمم المورد",
    hint: "يُرفع تنبيه عن كل مورد يتجاوز رصيده هذا المبلغ.",
    suffix: "د.أ",
    min: 0,
    max: 1_000_000,
  },
  {
    key: "dead_stock_days",
    label: "مدة ركود المخزون",
    hint: "موديل لم يُبع خلال هذه المدة يُعتبر راكداً.",
    suffix: "يوم",
    min: 1,
    max: 3650,
  },
  {
    key: "high_return_rate_percent",
    label: "حد معدل المرتجعات",
    hint: "نسبة القطع المرتجعة إلى المباعة التي يُرفع عندها تنبيه.",
    suffix: "%",
    min: 0,
    max: 100,
  },
  {
    key: "expense_growth_percent",
    label: "حد نمو المصاريف",
    hint: "نسبة ارتفاع المصاريف عن الفترة السابقة التي يُرفع عندها تنبيه.",
    suffix: "%",
    min: 0,
    max: 1000,
  },
];

export function AlertThresholdsForm({ settings }: { settings: ReportSettings }) {
  const initial = useMemo(
    () =>
      Object.fromEntries(FIELDS.map((f) => [f.key, Number(settings[f.key] ?? 0)])) as Record<
        string,
        number
      >,
    [settings],
  );
  const [draft, setDraft] = useState(initial);
  const [pending, startTransition] = useTransition();

  const dirty = FIELDS.some((f) => Number(draft[f.key]) !== Number(initial[f.key]));

  function save() {
    startTransition(async () => {
      const result = await updateAlertThresholdsAction(draft);
      if (result.ok) toast.success("حُفظت الحدود");
      else toast.error(result.error);
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="space-y-4"
    >
      <div className="space-y-1">
        {FIELDS.map((field) => {
          const changed = Number(draft[field.key]) !== Number(initial[field.key]);
          return (
            <div
              key={field.key}
              className={cn(
                "flex items-start justify-between gap-4 rounded-xl border p-3 transition-colors",
                changed ? "border-primary/40 bg-primary/[0.03]" : "border-border/70",
              )}
            >
              <span className="min-w-0 space-y-1">
                <Label htmlFor={field.key} className="font-medium">
                  {field.label}
                </Label>
                <span className="text-muted-foreground block text-xs leading-relaxed">
                  {field.hint}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Input
                  id={field.key}
                  type="number"
                  inputMode="numeric"
                  className="w-32 text-start"
                  min={field.min}
                  max={field.max}
                  value={String(draft[field.key] ?? "")}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [field.key]: Number(event.target.value),
                    }))
                  }
                />
                <span className="text-muted-foreground w-8 text-xs">{field.suffix}</span>
              </span>
            </div>
          );
        })}
      </div>

      <Separator />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || pending}>
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          حفظ الحدود
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={!dirty || pending}
          onClick={() => setDraft(initial)}
        >
          <RotateCcw className="size-4" />
          إلغاء
        </Button>
      </div>
    </form>
  );
}
