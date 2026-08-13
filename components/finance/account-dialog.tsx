"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createAccountAction, updateAccountAction } from "@/app/actions/finance";
import {
  ACCOUNT_TYPE_LABELS,
  FINANCIAL_ACCOUNT_TYPES,
  type AccountBalance,
  type FinancialAccountType,
} from "@/types/finance";

/**
 * Creates or edits a financial account.
 *
 * The opening balance is set once, at creation, and is not editable afterwards:
 * it has already been posted to the ledger as its own transaction, and quietly
 * changing it would move money that no movement accounts for. A correction is a
 * financial adjustment, which leaves a reason and an audit trail.
 */
export function AccountDialog({ account }: { account?: AccountBalance }) {
  const router = useRouter();
  const isEdit = !!account;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<FinancialAccountType>(account?.account_type ?? "CASH");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [isDefault, setIsDefault] = useState(account?.is_default ?? false);
  const [isActive, setIsActive] = useState(account?.is_active ?? true);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (name.trim().length < 2) {
      setError("اسم الحساب مطلوب.");
      return;
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateAccountAction({
            id: account.account_id,
            name: name.trim(),
            is_default: isDefault,
            is_active: isActive,
            notes: notes.trim() || undefined,
          })
        : await createAccountAction({
            name: name.trim(),
            account_type: type,
            opening_balance: openingBalance.trim() || "0",
            is_default: isDefault,
            is_active: isActive,
            notes: notes.trim() || undefined,
          });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(isEdit ? "تم تحديث الحساب" : "تم إنشاء الحساب");
      setOpen(false);
      if (!isEdit) {
        setName("");
        setOpeningBalance("0");
      }
      router.refresh();
    });
  }

  return (
    <>
      <Button variant={isEdit ? "outline" : "default"} onClick={() => setOpen(true)}>
        {isEdit ? (
          "تعديل"
        ) : (
          <>
            <Plus className="size-4" />
            إضافة حساب
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={isPending ? undefined : setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? "تعديل الحساب" : "إضافة حساب مالي"}</DialogTitle>
            <DialogDescription className="leading-relaxed">
              {isEdit
                ? "الرصيد الافتتاحي غير قابل للتعديل — سُجّل كحركة مالية. لتصحيحه استخدم تعديلاً مالياً."
                : "سيُسجَّل الرصيد الافتتاحي كحركة مالية على الحساب."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error ? (
              <p
                role="alert"
                className="border-destructive/25 bg-destructive/8 text-destructive rounded-xl border px-3.5 py-3 text-sm leading-relaxed"
              >
                {error}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="account_name">
                  اسم الحساب <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="account_name"
                  className="h-11"
                  placeholder="مثال: البنك العربي"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={isPending}
                />
              </div>

              {!isEdit ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="account_type">النوع</Label>
                    <Select
                      value={type}
                      onValueChange={(value) => setType(value as FinancialAccountType)}
                      disabled={isPending}
                    >
                      <SelectTrigger id="account_type" className="h-11 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FINANCIAL_ACCOUNT_TYPES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {ACCOUNT_TYPE_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="opening_balance">الرصيد الافتتاحي</Label>
                    <Input
                      id="opening_balance"
                      inputMode="decimal"
                      dir="ltr"
                      className="h-11 text-left"
                      value={openingBalance}
                      onChange={(event) => setOpeningBalance(event.target.value)}
                      disabled={isPending}
                    />
                  </div>
                </>
              ) : null}

              <div className="flex items-center justify-between rounded-xl border px-3.5 py-3 sm:col-span-2">
                <div className="space-y-0.5">
                  <Label htmlFor="account_default">الحساب الافتراضي</Label>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    يُستخدم تلقائياً للمدفوعات من هذا النوع عندما لا يُختار حساب.
                  </p>
                </div>
                <Switch
                  id="account_default"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                  disabled={isPending}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border px-3.5 py-3 sm:col-span-2">
                <div className="space-y-0.5">
                  <Label htmlFor="account_active">مفعّل</Label>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    الحساب المعطّل لا يظهر في قوائم الاختيار.
                  </p>
                </div>
                <Switch
                  id="account_active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="account_notes">ملاحظات</Label>
                <Textarea
                  id="account_notes"
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              تراجع
            </Button>
            <Button type="button" onClick={submit} disabled={isPending}>
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                "حفظ"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
