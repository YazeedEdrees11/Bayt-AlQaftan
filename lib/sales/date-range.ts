/**
 * Date-range presets for the sales dashboard.
 *
 * Everything is computed in local time and emitted as `YYYY-MM-DD`, which is
 * what the `date` columns compare against — using UTC here would shift the
 * shop's "today" by a few hours.
 */

export const DATE_PRESETS = [
  { value: "today", label: "اليوم" },
  { value: "yesterday", label: "أمس" },
  { value: "week", label: "هذا الأسبوع" },
  { value: "month", label: "هذا الشهر" },
  { value: "lastMonth", label: "الشهر الماضي" },
  { value: "year", label: "هذه السنة" },
  { value: "all", label: "كل الفترات" },
  { value: "custom", label: "فترة مخصصة" },
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number]["value"];

export function isDatePreset(value: unknown): value is DatePreset {
  return DATE_PRESETS.some((preset) => preset.value === value);
}

function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface DateRange {
  from?: string;
  to?: string;
}

/**
 * Resolves a preset into a concrete range.
 * `custom` passes the supplied dates straight through; `all` clears both.
 */
export function resolveDateRange(
  preset: DatePreset,
  custom: DateRange = {},
  now: Date = new Date(),
): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "today":
      return { from: toIso(today), to: toIso(today) };

    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: toIso(yesterday), to: toIso(yesterday) };
    }

    case "lastMonth": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      // Day 0 of this month is the last day of the previous one.
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toIso(start), to: toIso(end) };
    }

    case "year":
      return {
        from: toIso(new Date(today.getFullYear(), 0, 1)),
        to: toIso(today),
      };

    case "week": {
      // The shop's week runs Saturday → Friday, as in Jordan.
      const start = new Date(today);
      const offset = (start.getDay() + 1) % 7; // Saturday = 0
      start.setDate(start.getDate() - offset);
      return { from: toIso(start), to: toIso(today) };
    }

    case "month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toIso(start), to: toIso(today) };
    }

    case "custom":
      return { from: custom.from || undefined, to: custom.to || undefined };

    case "all":
    default:
      return {};
  }
}
