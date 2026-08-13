"use client";

import { useState, useTransition } from "react";
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
import { createCategoryAction } from "@/app/actions/products";
import type { Category } from "@/types/catalog";

/**
 * Category picker with inline creation.
 *
 * Categories are data, never a hardcoded list, so adding one has to be
 * possible without leaving the product form.
 */
export function CategorySelect({
  value,
  onChange,
  categories,
  disabled,
  error,
  canCreate,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  categories: Category[];
  disabled?: boolean;
  error?: string;
  canCreate: boolean;
}) {
  const [options, setOptions] = useState(categories);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      setFormError("اسم التصنيف مطلوب");
      return;
    }

    setFormError(null);
    startTransition(async () => {
      const result = await createCategoryAction({
        name: trimmed,
        description: "",
        is_active: true,
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      if (result.data) {
        setOptions((current) => [
          ...current,
          {
            id: result.data!.id,
            name: result.data!.name,
            description: null,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);
        onChange(result.data.id);
      }

      toast.success("تم إنشاء التصنيف");
      setName("");
      setOpen(false);
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="category_id">
        التصنيف <span className="text-destructive">*</span>
      </Label>
      <div className="flex gap-2">
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger
            id="category_id"
            className="h-11 flex-1"
            aria-invalid={!!error}
          >
            <SelectValue placeholder="اختر التصنيف" />
          </SelectTrigger>
          <SelectContent>
            {options.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canCreate ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0"
            onClick={() => setOpen(true)}
            disabled={disabled}
            aria-label="إضافة تصنيف"
          >
            <Plus className="size-4" />
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>إضافة تصنيف</DialogTitle>
            <DialogDescription>
              سيتم إضافة التصنيف واختياره لهذا المنتج مباشرة.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="new_category_name">اسم التصنيف</Label>
            <Input
              id="new_category_name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-11"
              placeholder="مثال: بشت"
              disabled={isPending}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleCreate();
                }
              }}
            />
            {formError ? (
              <p className="text-destructive text-xs">{formError}</p>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              إلغاء
            </Button>
            <Button type="button" onClick={handleCreate} disabled={isPending}>
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                "إضافة"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
