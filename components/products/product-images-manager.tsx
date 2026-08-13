"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  LoaderCircle,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ProductThumb } from "@/components/catalog/product-thumb";
import {
  deleteProductImageAction,
  reorderProductImagesAction,
  setPrimaryImageAction,
  uploadProductImageAction,
} from "@/app/actions/product-images";
import {
  ACCEPTED_IMAGE_EXTENSIONS,
  ACCEPTED_IMAGE_MIME_TYPES,
  IMAGE_ACCEPT_ATTRIBUTE,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_PRODUCT,
} from "@/lib/catalog/config";
import { cn } from "@/lib/utils/cn";
import type { ProductImage } from "@/types/catalog";

type Image = ProductImage & { url: string | null };

/** Mirrors the server-side check so bad files never leave the browser. */
function validate(file: File): string | null {
  if (!(ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `«${file.name}»: صيغة غير مدعومة. الصيغ المقبولة: ${ACCEPTED_IMAGE_EXTENSIONS.join(", ").toUpperCase()}.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
    return `«${file.name}»: الحجم يتجاوز ${mb} ميجابايت.`;
  }
  return null;
}

export function ProductImagesManager({
  productId,
  productName,
  images,
  canManage,
}: {
  productId: string;
  productName: string;
  images: Image[];
  canManage: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Image | null>(null);
  const [isPending, startTransition] = useTransition();

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;

    if (images.length + list.length > MAX_IMAGES_PER_PRODUCT) {
      toast.error(
        `لا يمكن إضافة أكثر من ${MAX_IMAGES_PER_PRODUCT} صور للمنتج الواحد.`,
      );
      return;
    }

    setUploading(true);
    let uploaded = 0;

    for (const file of list) {
      const problem = validate(file);
      if (problem) {
        toast.error(problem);
        continue;
      }

      const formData = new FormData();
      formData.set("product_id", productId);
      formData.set("alt_text", productName);
      formData.set("file", file);

      const result = await uploadProductImageAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        continue;
      }
      uploaded += 1;
    }

    setUploading(false);
    if (uploaded > 0) {
      toast.success(
        uploaded === 1 ? "تم رفع الصورة" : `تم رفع ${uploaded} صور`,
      );
      router.refresh();
    }
  }

  function handleSetPrimary(image: Image) {
    startTransition(async () => {
      const result = await setPrimaryImageAction({ id: image.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("تم تعيين الصورة الرئيسية");
      router.refresh();
    });
  }

  function handleDelete(image: Image) {
    startTransition(async () => {
      const result = await deleteProductImageAction({ id: image.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("تم حذف الصورة");
      setPendingDelete(null);
      router.refresh();
    });
  }

  /** Moves an image one slot and persists the whole new order. */
  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;

    const ordered = [...images];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);

    startTransition(async () => {
      const result = await reorderProductImagesAction({
        product_id: productId,
        ordered_ids: ordered.map((image) => image.id),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  const busy = uploading || isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>صور المنتج</CardTitle>
        <CardDescription>
          الصورة الرئيسية هي التي تظهر في قوائم المنتجات والمخزون.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {images.length === 0 && !canManage ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            لا توجد صور لهذا المنتج.
          </p>
        ) : null}

        {images.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((image, index) => (
              <div
                key={image.id}
                className={cn(
                  "group border-border/70 relative overflow-hidden rounded-xl border",
                  image.is_primary && "ring-primary/40 ring-2",
                )}
              >
                <div className="bg-muted aspect-square w-full">
                  <ProductThumb
                    url={image.url}
                    alt={image.alt_text ?? productName}
                    rounded="rounded-none"
                    className="size-full"
                  />
                </div>

                {image.is_primary ? (
                  <Badge className="bg-primary text-primary-foreground absolute start-2 top-2 gap-1">
                    <Star className="size-3 fill-current" />
                    الرئيسية
                  </Badge>
                ) : null}

                {canManage ? (
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="size-7"
                        disabled={busy || index === 0}
                        onClick={() => handleMove(index, -1)}
                        aria-label="تحريك لليمين"
                      >
                        <ChevronRight className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="size-7"
                        disabled={busy || index === images.length - 1}
                        onClick={() => handleMove(index, 1)}
                        aria-label="تحريك لليسار"
                      >
                        <ChevronLeft className="size-3.5" />
                      </Button>
                    </div>

                    <div className="flex gap-1">
                      {!image.is_primary ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="size-7"
                          disabled={busy}
                          onClick={() => handleSetPrimary(image)}
                          aria-label="اجعلها الصورة الرئيسية"
                          title="اجعلها الصورة الرئيسية"
                        >
                          <Star className="size-3.5" />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="size-7"
                        disabled={busy}
                        onClick={() => setPendingDelete(image)}
                        aria-label="حذف الصورة"
                        title="حذف الصورة"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {canManage ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (event.dataTransfer.files?.length) {
                void uploadFiles(event.dataTransfer.files);
              }
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
              dragging
                ? "border-primary bg-accent"
                : "border-border bg-muted/30",
            )}
          >
            <span className="bg-card text-muted-foreground flex size-11 items-center justify-center rounded-xl border">
              {uploading ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <ImagePlus className="size-5" strokeWidth={1.6} />
              )}
            </span>

            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {uploading ? "جاري رفع الصور..." : "إضافة صورة"}
              </p>
              <p className="text-muted-foreground text-xs">
                اسحب الصور هنا أو اضغط للاختيار · JPG، PNG، WEBP · حتى{" "}
                {Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} ميجابايت
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-4" />
              اختيار صور
            </Button>

            <input
              ref={inputRef}
              type="file"
              accept={IMAGE_ACCEPT_ATTRIBUTE}
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.length) {
                  void uploadFiles(event.target.files);
                }
                event.target.value = "";
              }}
            />
          </div>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="حذف الصورة"
        description="سيتم حذف الصورة نهائياً من التخزين. لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        destructive
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete);
        }}
      />
    </Card>
  );
}
