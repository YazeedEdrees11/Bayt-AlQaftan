import { z } from "zod";

import { MANUAL_TRANSACTION_TYPES } from "@/types/catalog";
import type { ManualTransactionType } from "@/types/catalog";

/**
 * Zod schemas for the catalog, suppliers and inventory.
 *
 * The same schema validates the browser form and re-validates the payload
 * inside the Server Action. The client pass is convenience; the server pass is
 * the boundary.
 */

const uuid = z.string().uuid("المعرّف غير صحيح");

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} طويل جداً`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? undefined);

/** Accepts "12", "12.5", "" — money always lands as a 2-decimal number. */
const money = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((value) =>
      typeof value === "string" ? value.trim().replace(/[٫،]/g, ".") : value,
    )
    .refine((value) => value !== "" && !Number.isNaN(Number(value)), {
      message: `${label} يجب أن يكون رقماً`,
    })
    .transform((value) => Math.round(Number(value) * 100) / 100)
    .refine((value) => value >= 0, { message: `${label} لا يمكن أن يكون سالباً` })
    .refine((value) => value <= 9_999_999.99, {
      message: `${label} كبير جداً`,
    });

const optionalMoney = (label: string) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((value) =>
      value === "" || value === null || value === undefined
        ? null
        : typeof value === "string"
          ? value.trim().replace(/[٫،]/g, ".")
          : value,
    )
    .refine((value) => value === null || !Number.isNaN(Number(value)), {
      message: `${label} يجب أن يكون رقماً`,
    })
    .transform((value) =>
      value === null ? null : Math.round(Number(value) * 100) / 100,
    )
    .refine((value) => value === null || value >= 0, {
      message: `${label} لا يمكن أن يكون سالباً`,
    });

/** Whole, non-negative quantities. */
const quantity = (label: string, { min = 0 }: { min?: number } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => (typeof value === "string" ? value.trim() : value))
    .refine((value) => value !== "" && !Number.isNaN(Number(value)), {
      message: `${label} يجب أن يكون رقماً`,
    })
    .transform((value) => Number(value))
    .refine((value) => Number.isInteger(value), {
      message: `${label} يجب أن يكون رقماً صحيحاً`,
    })
    .refine((value) => value >= min, {
      message:
        min > 0
          ? `${label} يجب أن يكون ${min} على الأقل`
          : `${label} لا يمكن أن يكون سالباً`,
    })
    .refine((value) => value <= 1_000_000, { message: `${label} كبير جداً` });

/* -------------------------------------------------------------------------- */
/*                                 Category                                   */
/* -------------------------------------------------------------------------- */

export const categorySchema = z.object({
  name: z
    .string()
    .min(1, "اسم التصنيف مطلوب")
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "اسم التصنيف مطلوب").max(120, "الاسم طويل جداً")),
  description: optionalText(500, "الوصف"),
  is_active: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categorySchema>;

/* -------------------------------------------------------------------------- */
/*                                 Supplier                                   */
/* -------------------------------------------------------------------------- */

/** Jordanian mobile/landline formats plus generic international. */
const phone = (label: string) =>
  z
    .string()
    .trim()
    .max(32, `${label} طويل جداً`)
    .refine((value) => value === "" || /^[+0-9\s()-]{6,32}$/.test(value), {
      message: `صيغة ${label} غير صحيحة`,
    })
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? undefined);

export const supplierSchema = z.object({
  name: z
    .string()
    .min(1, "اسم المورد مطلوب")
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(
      z.string().min(2, "اسم المورد قصير جداً").max(160, "الاسم طويل جداً"),
    ),
  phone: phone("رقم الهاتف"),
  whatsapp: phone("رقم الواتساب"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (value) => value === "" || z.string().email().safeParse(value).success,
      { message: "صيغة البريد الإلكتروني غير صحيحة" },
    )
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  address: optionalText(400, "العنوان"),
  notes: optionalText(1000, "الملاحظات"),
  is_active: z.boolean().default(true),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const supplierUpdateSchema = supplierSchema.extend({ id: uuid });
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;

/* -------------------------------------------------------------------------- */
/*                                  Variant                                   */
/* -------------------------------------------------------------------------- */

export const variantSchema = z.object({
  /** Present when editing an existing variant, absent when creating one. */
  id: uuid.optional(),
  sku: z
    .string()
    .min(1, "رقم SKU مطلوب")
    .transform((value) => value.trim().toUpperCase())
    .pipe(
      z
        .string()
        .min(1, "رقم SKU مطلوب")
        .max(64, "رقم SKU طويل جداً")
        .regex(/^[A-Z0-9._/-]+$/, "رقم SKU يقبل الأحرف والأرقام و - _ . / فقط"),
    ),
  barcode: z
    .string()
    .trim()
    .max(64, "الباركود طويل جداً")
    .refine((value) => value === "" || /^[A-Za-z0-9-]+$/.test(value), {
      message: "الباركود يقبل الأحرف والأرقام والشرطة فقط",
    })
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  color: optionalText(60, "اللون"),
  size: optionalText(30, "المقاس"),
  supplier_id: uuid.nullable().optional().transform((value) => value ?? undefined),
  purchase_price: money("سعر الشراء"),
  selling_price: money("سعر البيع"),
  /** Only applied when the variant is first created. */
  initial_stock: quantity("الرصيد الابتدائي").default(0),
  is_active: z.boolean().default(true),
});
export type VariantInput = z.infer<typeof variantSchema>;

/* -------------------------------------------------------------------------- */
/*                                  Product                                   */
/* -------------------------------------------------------------------------- */

const productBase = z.object({
  name: z
    .string()
    .min(1, "اسم المنتج مطلوب")
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(
      z.string().min(2, "اسم المنتج قصير جداً").max(200, "الاسم طويل جداً"),
    ),
  description: optionalText(2000, "الوصف"),
  category_id: uuid.refine((value) => value.length > 0, {
    message: "التصنيف مطلوب",
  }),
  brand: optionalText(120, "العلامة التجارية"),
  base_selling_price: optionalMoney("السعر الأساسي"),
  is_active: z.boolean().default(true),
});

export const createProductSchema = productBase.extend({
  variants: z
    .array(variantSchema)
    .min(1, "يجب إضافة موديل واحد على الأقل")
    .max(100, "عدد الموديلات كبير جداً")
    .superRefine((variants, ctx) => {
      const seen = new Set<string>();
      variants.forEach((variant, index) => {
        const sku = variant.sku.toUpperCase();
        if (seen.has(sku)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "sku"],
            message: "رقم SKU مكرر داخل نفس المنتج",
          });
        }
        seen.add(sku);
      });

      const barcodes = new Set<string>();
      variants.forEach((variant, index) => {
        if (!variant.barcode) return;
        if (barcodes.has(variant.barcode)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "barcode"],
            message: "الباركود مكرر داخل نفس المنتج",
          });
        }
        barcodes.add(variant.barcode);
      });
    }),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

/** Editing a product touches the template only; variants have their own forms. */
export const updateProductSchema = productBase.extend({ id: uuid });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** Creating or editing a single variant from the product detail page. */
export const singleVariantSchema = variantSchema.extend({
  product_id: uuid,
});
export type SingleVariantInput = z.infer<typeof singleVariantSchema>;

/* -------------------------------------------------------------------------- */
/*                             Stock adjustment                               */
/* -------------------------------------------------------------------------- */

export const stockAdjustmentSchema = z.object({
  variant_id: uuid,
  transaction_type: z.enum(
    MANUAL_TRANSACTION_TYPES as unknown as [
      ManualTransactionType,
      ...ManualTransactionType[],
    ],
    { errorMap: () => ({ message: "نوع الحركة غير صحيح" }) },
  ),
  quantity: quantity("الكمية", { min: 1 }),
  notes: z
    .string()
    .trim()
    .min(1, "السبب مطلوب")
    .max(300, "السبب طويل جداً"),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

/* -------------------------------------------------------------------------- */
/*                                  Images                                    */
/* -------------------------------------------------------------------------- */

export const imageMetaSchema = z.object({
  product_id: uuid,
  variant_id: uuid.nullable().optional().transform((value) => value ?? undefined),
  alt_text: optionalText(200, "النص البديل"),
});
export type ImageMetaInput = z.infer<typeof imageMetaSchema>;

export const reorderImagesSchema = z.object({
  product_id: uuid,
  ordered_ids: z.array(uuid).min(1, "لا توجد صور لإعادة ترتيبها"),
});
export type ReorderImagesInput = z.infer<typeof reorderImagesSchema>;
