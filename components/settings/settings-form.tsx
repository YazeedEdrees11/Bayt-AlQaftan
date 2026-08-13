"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { LoaderCircle, RotateCcw, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { updateSettingsAction } from "@/app/actions/settings";
import { cn } from "@/lib/utils/cn";
import type { SettingKey, SystemSetting } from "@/types/settings";

/**
 * Labels and help text for individual settings.
 *
 * The database carries an Arabic description for every setting; this adds the
 * short field label and, where a setting has a consequence worth stating, the
 * sentence that explains it. Anything not listed falls back to the description.
 */
export type FieldCopy = {
  label: string;
  hint?: string;
  /** Marks a setting the schema already enforces; shown but not editable. */
  readOnly?: boolean;
  /** Confirmation text for a setting that deserves a second thought (§75). */
  confirm?: string;
  /** Values that render as a picker of named things rather than a raw id. */
  options?: { value: string; label: string }[];
};

export type SettingsFormProps = {
  settings: SystemSetting[];
  copy: Record<string, FieldCopy>;
  /** Optional grouping: heading → keys, in the order they should appear. */
  groups?: { title: string; description?: string; keys: string[] }[];
};

type Draft = Record<string, unknown>;

export function SettingsForm({ settings, copy, groups }: SettingsFormProps) {
  const initial = useMemo<Draft>(
    () => Object.fromEntries(settings.map((s) => [s.key, s.value])),
    [settings],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);

  const dirtyKeys = useMemo(
    () => Object.keys(initial).filter((key) => !same(draft[key], initial[key])),
    [draft, initial],
  );
  const dirty = dirtyKeys.length > 0;

  // §76. The browser's own prompt is the only one that can block a reload or a
  // closed tab; an in-app dialog cannot. It is deliberately not wired to
  // in-app navigation, where a half-finished form is recoverable anyway.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setValue = useCallback((key: string, value: unknown) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  function save() {
    // Keys come from the settings the server sent, so they are already valid;
    // updateSettingsAction filters them against the allowlist again regardless.
    const changed = Object.fromEntries(
      dirtyKeys.map((key) => [key as SettingKey, draft[key]]),
    );
    startTransition(async () => {
      const result = await updateSettingsAction(changed);
      if (result.ok) {
        setErrors({});
        toast.success("حُفظت الإعدادات");
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  function attemptSave() {
    // A dangerous setting asks once before it is committed (§75).
    const risky = dirtyKeys.find((key) => copy[key]?.confirm && truthy(draft[key]));
    if (risky) {
      setConfirming(risky);
      return;
    }
    save();
  }

  const sections = groups ?? [{ title: "", keys: settings.map((s) => s.key) }];
  const byKey = new Map<string, SystemSetting>(settings.map((s) => [s.key, s]));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        attemptSave();
      }}
      className="space-y-6"
    >
      {sections.map((section, index) => (
        <div key={section.title || index} className="space-y-4">
          {section.title ? (
            <div className="space-y-1">
              <h3 className="font-medium">{section.title}</h3>
              {section.description ? (
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {section.description}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1">
            {section.keys.map((key) => {
              const setting = byKey.get(key);
              if (!setting) return null;
              return (
                <SettingField
                  key={key}
                  setting={setting}
                  copy={copy[key]}
                  value={draft[key]}
                  error={errors[key]}
                  changed={!same(draft[key], initial[key])}
                  onChange={(value) => setValue(key, value)}
                />
              );
            })}
          </div>
        </div>
      ))}

      <Separator />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!dirty || pending}>
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          حفظ
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={!dirty || pending}
          onClick={() => {
            setDraft(initial);
            setErrors({});
          }}
        >
          <RotateCcw className="size-4" />
          إلغاء
        </Button>
        {dirty ? (
          <span className="text-warning flex items-center gap-1.5 text-sm">
            <TriangleAlert className="size-4" />
            {dirtyKeys.length} تغيير غير محفوظ
          </span>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="تأكيد التغيير"
        description={confirming ? (copy[confirming]?.confirm ?? "") : ""}
        confirmLabel="متابعة الحفظ"
        onConfirm={() => {
          setConfirming(null);
          save();
        }}
      />
    </form>
  );
}

function SettingField({
  setting,
  copy,
  value,
  error,
  changed,
  onChange,
}: {
  setting: SystemSetting;
  copy?: FieldCopy;
  value: unknown;
  error?: string;
  changed: boolean;
  onChange: (value: unknown) => void;
}) {
  const id = `setting-${setting.key}`;
  const label = copy?.label ?? setting.description ?? setting.key;
  const hint = copy?.hint ?? (copy?.label ? setting.description : null);
  const disabled = copy?.readOnly === true;

  const description = (
    <span className="min-w-0 space-y-1">
      <Label htmlFor={id} className={cn("font-medium", disabled && "text-muted-foreground")}>
        {label}
      </Label>
      {hint ? (
        <span className="text-muted-foreground block text-xs leading-relaxed">{hint}</span>
      ) : null}
      {disabled ? (
        <span className="text-muted-foreground block text-xs">
          مفروض على مستوى قاعدة البيانات ولا يمكن تعطيله.
        </span>
      ) : null}
      {error ? (
        <span className="text-destructive block text-xs">{error}</span>
      ) : null}
    </span>
  );

  const row = "flex items-start justify-between gap-4 rounded-xl border p-3 transition-colors";
  const state = cn(
    changed ? "border-primary/40 bg-primary/[0.03]" : "border-border/70",
    error && "border-destructive/50",
  );

  if (setting.value_type === "boolean") {
    return (
      <div className={cn(row, state)}>
        {description}
        <Switch
          id={id}
          checked={value === true}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </div>
    );
  }

  if (setting.value_type === "enum" || copy?.options) {
    const options =
      copy?.options ??
      (setting.allowed_values ?? []).map((v) => ({ value: v, label: v }));
    return (
      <div className={cn(row, state)}>
        {description}
        <Select
          value={value === null || value === undefined ? "__none" : String(value)}
          disabled={disabled}
          onValueChange={(next) => onChange(next === "__none" ? null : next)}
        >
          <SelectTrigger id={id} className="w-52 shrink-0">
            <SelectValue placeholder="اختر…" />
          </SelectTrigger>
          <SelectContent>
            {copy?.options ? (
              <SelectItem value="__none">بدون</SelectItem>
            ) : null}
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (setting.value_type === "number") {
    return (
      <div className={cn(row, state)}>
        {description}
        <span className="shrink-0 space-y-1">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            className="w-32 text-start"
            value={value === null || value === undefined ? "" : String(value)}
            min={setting.min_value ?? undefined}
            max={setting.max_value ?? undefined}
            disabled={disabled}
            onChange={(event) => {
              const raw = event.target.value;
              onChange(raw === "" ? null : Number(raw));
            }}
          />
          {setting.min_value !== null || setting.max_value !== null ? (
            <span className="text-muted-foreground block text-center text-[0.7rem]">
              {setting.min_value ?? 0} – {setting.max_value ?? "∞"}
            </span>
          ) : null}
        </span>
      </div>
    );
  }

  // Long text gets a textarea; a prefix or short string gets an input.
  const long = String(value ?? "").length > 60 || setting.key.startsWith("return_policy");
  return (
    <div className={cn(row, state, long && "flex-col items-stretch")}>
      {description}
      {long ? (
        <Textarea
          id={id}
          rows={3}
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          className="w-52 shrink-0"
          dir={setting.value_type === "prefix" ? "ltr" : undefined}
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

/** jsonb round-trips make `2` and `2.0` the same value; compare accordingly. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function truthy(value: unknown): boolean {
  return value === true || (typeof value === "number" && value > 0);
}
