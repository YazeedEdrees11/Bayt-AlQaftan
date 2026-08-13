"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { ImageUp, LoaderCircle, RotateCcw, Save, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { updateStoreSettingsAction } from "@/app/actions/settings";
import { createClient } from "@/lib/supabase/client";
import { DATE_FORMATS, TIMEZONES, type StoreSettings } from "@/types/settings";
import { cn } from "@/lib/utils/cn";

const CURRENCIES = [
  { code: "JOD", symbol: "د.أ", label: "دينار أردني" },
  { code: "SAR", symbol: "ر.س", label: "ريال سعودي" },
  { code: "AED", symbol: "د.إ", label: "درهم إماراتي" },
  { code: "USD", symbol: "$", label: "دولار أمريكي" },
];

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * The store profile (§4).
 *
 * Currency is handled apart from everything else: the amounts already recorded
 * were entered in the old one and nothing restates them, so changing it needs a
 * deliberate confirmation and the server refuses without one (§72, §73).
 */
export function StoreForm({
  store,
  logoUrl,
  canEdit,
  displayTimezone,
}: {
  store: StoreSettings;
  logoUrl: string | null;
  canEdit: boolean;
  /** The zone dates actually render in, fixed at build time. */
  displayTimezone: string;
}) {
  const initial = useMemo(
    () => ({
      store_name: store.store_name ?? "",
      store_name_ar: store.store_name_ar ?? "",
      store_name_en: store.store_name_en ?? "",
      phone: store.phone ?? "",
      secondary_phone: store.secondary_phone ?? "",
      email: store.email ?? "",
      address: store.address ?? "",
      city: store.city ?? "",
      country: store.country ?? "",
      currency: store.currency ?? "JOD",
      currency_symbol: store.currency_symbol ?? "د.أ",
      timezone: store.timezone ?? "Asia/Amman",
      date_format: store.date_format ?? "DD/MM/YYYY",
    }),
    [store],
  );

  const [draft, setDraft] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [logo, setLogo] = useState<string | null>(store.logo_path);
  const [preview, setPreview] = useState<string | null>(logoUrl);
  const [confirmCurrency, setConfirmCurrency] = useState(false);

  const dirty = Object.keys(initial).some(
    (key) => draft[key as keyof typeof draft] !== initial[key as keyof typeof initial],
  );
  const currencyChanged = draft.currency !== initial.currency;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function field(key: keyof typeof draft) {
    return {
      value: draft[key],
      disabled: !canEdit,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft((current) => ({ ...current, [key]: event.target.value })),
    };
  }

  async function uploadLogo(file: File) {
    if (!LOGO_TYPES.includes(file.type)) {
      toast.error("الصيغ المقبولة: PNG أو JPG أو WEBP.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("حجم الشعار يجب أن يكون أقل من ٢ ميغابايت.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `logo-${Date.now()}.${extension}`;

      const { error } = await supabase.storage
        .from("store-assets")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (error) {
        // The bucket's policies allow administrators only, so this is what a
        // manager sees if they somehow reach the control.
        toast.error("تعذر رفع الشعار. تأكد من صلاحياتك ومن نوع الملف.");
        return;
      }

      const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
      setLogo(path);
      setPreview(data.publicUrl);

      const result = await updateStoreSettingsAction({ logo_path: path });
      if (result.ok) toast.success("تم تحديث الشعار");
      else toast.error(result.error);
    } finally {
      setUploading(false);
    }
  }

  function save() {
    startTransition(async () => {
      const payload: Record<string, unknown> = { ...draft };
      if (currencyChanged) payload.confirm_currency_change = true;

      const result = await updateStoreSettingsAction(payload);
      if (result.ok) toast.success("حُفظت بيانات المحل");
      else toast.error(result.error);
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (currencyChanged) setConfirmCurrency(true);
        else save();
      }}
      className="space-y-6"
    >
      {/* ------------------------------------------------------------ logo */}
      <div className="space-y-2">
        <Label>شعار المحل</Label>
        <div className="flex flex-wrap items-center gap-4">
          <div className="bg-muted/40 border-border/70 flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border">
            {preview ? (
              <Image
                src={preview}
                alt="شعار المحل"
                width={96}
                height={96}
                className="size-full object-contain"
                unoptimized
              />
            ) : (
              <ImageUp aria-hidden className="text-muted-foreground size-7" strokeWidth={1.6} />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={!canEdit || uploading} asChild>
                <label className={cn(!canEdit && "pointer-events-none opacity-50")}>
                  {uploading ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <ImageUp className="size-4" />
                  )}
                  اختر صورة
                  <input
                    type="file"
                    accept={LOGO_TYPES.join(",")}
                    className="sr-only"
                    disabled={!canEdit || uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadLogo(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </Button>
              {logo ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!canEdit || uploading}
                  onClick={async () => {
                    setLogo(null);
                    setPreview(null);
                    await updateStoreSettingsAction({ logo_path: "" });
                    toast.success("أُزيل الشعار");
                  }}
                >
                  <X className="size-4" />
                  إزالة
                </Button>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              PNG أو JPG أو WEBP، بحد أقصى ٢ ميغابايت. صيغة SVG غير مقبولة لأن
              الشعار يُعرض للجميع على الإيصالات.
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* ------------------------------------------------------------ names */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Row id="store_name" label="اسم المحل" required>
          <Input id="store_name" {...field("store_name")} />
        </Row>
        <Row id="store_name_ar" label="الاسم بالعربية">
          <Input id="store_name_ar" {...field("store_name_ar")} />
        </Row>
        <Row id="store_name_en" label="الاسم بالإنجليزية">
          <Input id="store_name_en" dir="ltr" {...field("store_name_en")} />
        </Row>
        <Row id="email" label="البريد الإلكتروني">
          <Input id="email" type="email" dir="ltr" {...field("email")} />
        </Row>
        <Row id="phone" label="رقم الهاتف">
          <Input id="phone" dir="ltr" {...field("phone")} />
        </Row>
        <Row id="secondary_phone" label="رقم إضافي">
          <Input id="secondary_phone" dir="ltr" {...field("secondary_phone")} />
        </Row>
        <Row id="city" label="المدينة">
          <Input id="city" {...field("city")} />
        </Row>
        <Row id="country" label="الدولة">
          <Input id="country" {...field("country")} />
        </Row>
      </div>

      <Row id="address" label="العنوان">
        <Textarea id="address" rows={2} {...field("address")} />
      </Row>

      <Separator />

      {/* --------------------------------------------------------- locale */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Row id="currency" label="العملة">
          <Select
            value={draft.currency}
            disabled={!canEdit}
            onValueChange={(value) => {
              const found = CURRENCIES.find((c) => c.code === value);
              setDraft((current) => ({
                ...current,
                currency: value,
                currency_symbol: found?.symbol ?? current.currency_symbol,
              }));
            }}
          >
            <SelectTrigger id="currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((currency) => (
                <SelectItem key={currency.code} value={currency.code}>
                  {currency.label} ({currency.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row id="currency_symbol" label="رمز العملة">
          <Input id="currency_symbol" {...field("currency_symbol")} />
        </Row>

        <Row id="timezone" label="المنطقة الزمنية">
          <Select
            value={draft.timezone}
            disabled={!canEdit}
            onValueChange={(value) => setDraft((c) => ({ ...c, timezone: value }))}
          >
            <SelectTrigger id="timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {draft.timezone !== displayTimezone ? (
            <p className="text-warning text-xs leading-relaxed">
              التواريخ معروضة حالياً بتوقيت {displayTimezone}. تغيير هذا الحقل
              يسجّل موقع المحل، ولا يغيّر العرض إلا بعد تحديث إعداد النشر
              وإعادة نشر التطبيق.
            </p>
          ) : null}
        </Row>

        <Row id="date_format" label="تنسيق التاريخ">
          <Select
            value={draft.date_format}
            disabled={!canEdit}
            onValueChange={(value) => setDraft((c) => ({ ...c, date_format: value }))}
          >
            <SelectTrigger id="date_format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMATS.map((format) => (
                <SelectItem key={format} value={format}>
                  {format}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </div>

      {currencyChanged ? (
        <p className="border-warning/40 bg-warning/5 text-warning flex items-start gap-2 rounded-xl border p-3 text-sm leading-relaxed">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          تحذير: تغيير العملة قد يؤثر على عرض البيانات المالية المستقبلية. تأكد
          من أن النظام لم يبدأ بتسجيل معاملات بعملة مختلفة.
        </p>
      ) : null}

      <Separator />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!canEdit || !dirty || pending}>
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          حفظ التغييرات
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
        {dirty ? (
          <span className="text-warning flex items-center gap-1.5 text-sm">
            <TriangleAlert className="size-4" />
            تغييرات غير محفوظة
          </span>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmCurrency}
        onOpenChange={setConfirmCurrency}
        title="تغيير العملة"
        description="تحذير: تغيير العملة قد يؤثر على عرض البيانات المالية المستقبلية. تأكد من أن النظام لم يبدأ بتسجيل معاملات بعملة مختلفة. المبالغ المسجّلة سابقاً لن تُحوَّل."
        confirmLabel="نعم، غيّر العملة"
        destructive
        onConfirm={() => {
          setConfirmCurrency(false);
          save();
        }}
      />
    </form>
  );
}

function Row({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
