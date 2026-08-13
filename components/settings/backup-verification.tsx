"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { recordBackupVerifiedAction } from "@/app/actions/settings";

/**
 * Records that somebody checked a backup (§67).
 *
 * The system cannot see Supabase's backup schedule, so this is a person's
 * confirmation rather than a measurement — and the note is required precisely
 * so that the record says *what* was checked. "verified — daily, dashboard,
 * 12 Aug" is worth something; a bare timestamp is worth almost nothing.
 */
export function BackupVerification() {
  const [note, setNote] = useState("");
  const [restoreTested, setRestoreTested] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await recordBackupVerifiedAction({
            note: note.trim(),
            restore_tested: restoreTested,
          });
          if (result.ok) {
            toast.success("سُجّل التحقق من النسخة الاحتياطية");
            setNote("");
            setRestoreTested(false);
          } else {
            toast.error(result.error);
          }
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="backup_note">ما الذي تحققت منه؟</Label>
        <Input
          id="backup_note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="مثال: نسخة يومية في لوحة Supabase، آخرها اليوم"
          required
        />
        <p className="text-muted-foreground text-xs leading-relaxed">
          هذا تسجيل لتحقق بشري، لا قياس. النظام لا يرى جدول النسخ في Supabase
          ولا يستطيع تأكيد وجود نسخة بنفسه.
        </p>
      </div>

      <label className="border-border/70 flex items-start justify-between gap-4 rounded-xl border p-3">
        <span className="space-y-1">
          <span className="block text-sm font-medium">اختُبرت الاستعادة</span>
          <span className="text-muted-foreground block text-xs leading-relaxed">
            فعّلها فقط إذا استعدت النسخة في مشروع منفصل وشغّلت
            <code className="mx-1" dir="ltr">scripts/verify-restore.mjs</code>
            بنجاح. نسخة لم تُختبر استعادتها ليست نسخة، بل اعتقاد.
          </span>
        </span>
        <Switch checked={restoreTested} onCheckedChange={setRestoreTested} />
      </label>

      <Button type="submit" disabled={pending || note.trim().length === 0}>
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : restoreTested ? (
          <ShieldCheck className="size-4" />
        ) : (
          <CheckCircle2 className="size-4" />
        )}
        سجّل التحقق
      </Button>
    </form>
  );
}
