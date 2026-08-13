import { z } from "zod";

import { PURCHASE_PAYMENT_METHODS } from "@/types/purchasing";
import type { PurchasePaymentMethod } from "@/types/purchasing";

/** Statuses a user may ask for when saving a purchase. */
export const CREATABLE_PURCHASE_STATUSES = ["DRAFT", "COMPLETED"] as const;
export type CreatablePurchaseStatus =
  (typeof CREATABLE_PURCHASE_STATUSES)[number];

/**
 * Zod schemas for purchasing.
 *
 * Totals are deliberately absent from every payload: the database recomputes
 * subtotal, total, paid and remaining from the items. Anything the client
 * believes about money is a preview only.
 */

const uuid = z.string().uuid("المعرّف غير صحيح");

const isoDate = z
  .string()
  .min(1, "التاريخ مطلوب")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "التاريخ غير صحيح",
  });

const money = (label: string, { min = 0 }: { min?: number } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((value) =>
      typeof value === "string" ? value.trim().replace(/[٫،]/g, ".") : value,
    )
    .refine((value) => value !== "" && !Number.isNaN(Number(value)), {
      message: `${label} يجب أن يكون رقماً`,
    })
    .transform((value) => Math.round(Number(value) * 100) / 100)
    .refine((value) => value >= min, {
      message:
        min > 0
          ? `${label} يجب أن يكون أكبر من صفر`
          : `${label} لا يمكن أن يكون سالباً`,
    })
    .refine((value) => value <= 99_999_999.99, {
      message: `${label} كبير جداً`,
    });

const wholeNumber = (label: string, { min = 1 }: { min?: number } = {}) =>
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
      message: min > 0 ? "الكمية يجب أن تكون أكبر من صفر" : `${label} غير صحيح`,
    })
    .refine((value) => value <= 1_000_000, { message: `${label} كبير جداً` });

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} طويل جداً`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

const paymentMethod = z.enum(
  PURCHASE_PAYMENT_METHODS as unknown as [
    PurchasePaymentMethod,
    ...PurchasePaymentMethod[],
  ],
  { errorMap: () => ({ message: "طريقة الدفع غير صحيحة" }) },
);

/* -------------------------------------------------------------------------- */
/*                              Purchase items                                */
/* -------------------------------------------------------------------------- */

export const purchaseItemSchema = z.object({
  variant_id: uuid,
  quantity: wholeNumber("الكمية", { min: 1 }),
  unit_cost: money("سعر الشراء"),
});
export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>;

/* -------------------------------------------------------------------------- */
/*                                 Payments                                   */
/* -------------------------------------------------------------------------- */

/**
 * Bank transfers must carry a bank and a reference, otherwise the payment is
 * untraceable. Enforced here, in the RPC, and by a CHECK constraint.
 *
 * A plain callback rather than a generic wrapper: wrapping the schema in
 * `z.ZodType<T>` would erase the inferred object shape.
 */
function checkBankFields(
  value: {
    payment_method: PurchasePaymentMethod;
    bank_name: string | null;
    transfer_reference: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (value.payment_method !== "BANK_TRANSFER") return;
  if (!value.bank_name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bank_name"],
      message: "اسم البنك مطلوب للتحويل البنكي",
    });
  }
  if (!value.transfer_reference) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["transfer_reference"],
      message: "رقم التحويل مطلوب للتحويل البنكي",
    });
  }
}

const paymentBase = z.object({
  payment_method: paymentMethod,
  payment_date: isoDate,
  bank_name: optionalText(120, "اسم البنك"),
  transfer_reference: optionalText(120, "رقم التحويل"),
  receipt_image_path: optionalText(400, "مسار الإيصال"),
  notes: optionalText(500, "الملاحظات"),
});

/** Payment recorded together with a new purchase. Zero means "nothing paid". */
export const openingPaymentSchema = paymentBase
  .extend({ amount: money("المبلغ المدفوع") })
  .superRefine(checkBankFields);
export type OpeningPaymentInput = z.infer<typeof openingPaymentSchema>;

/** A later payment against an existing purchase. */
export const purchasePaymentSchema = paymentBase
  .extend({ purchase_id: uuid, amount: money("المبلغ", { min: 0.01 }) })
  .superRefine(checkBankFields);
export type PurchasePaymentInput = z.infer<typeof purchasePaymentSchema>;

/* -------------------------------------------------------------------------- */
/*                                 Purchase                                   */
/* -------------------------------------------------------------------------- */

export const createPurchaseSchema = z.object({
  supplier_id: uuid,
  purchase_date: isoDate,
  discount: money("الخصم").default(0),
  notes: optionalText(1000, "الملاحظات"),
  items: z
    .array(purchaseItemSchema)
    .min(1, "يجب إضافة منتج واحد على الأقل")
    .max(200, "عدد المنتجات كبير جداً")
    .superRefine((items, ctx) => {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.variant_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "variant_id"],
            message: "هذا الموديل مضاف مسبقاً في نفس الفاتورة",
          });
        }
        seen.add(item.variant_id);
      });
    }),
  /** Omitted, or amount 0, means nothing was paid up front. */
  payment: openingPaymentSchema.nullable().optional().default(null),
  /** Whether to refresh the variant's default cost from this purchase. */
  update_variant_cost: z.boolean().default(true),
  /**
   * DRAFT records the document only — no stock, no supplier charge, no
   * payment. COMPLETED applies all three.
   */
  status: z
    .enum(CREATABLE_PURCHASE_STATUSES as unknown as [
      CreatablePurchaseStatus,
      ...CreatablePurchaseStatus[],
    ])
    .default("COMPLETED"),
});
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

/** Promoting a draft to COMPLETED, optionally with an opening payment. */
export const completePurchaseSchema = z.object({
  purchase_id: uuid,
  payment: openingPaymentSchema.nullable().optional().default(null),
  update_variant_cost: z.boolean().default(true),
});
export type CompletePurchaseInput = z.infer<typeof completePurchaseSchema>;

export const deleteDraftSchema = z.object({ purchase_id: uuid });
export type DeleteDraftInput = z.infer<typeof deleteDraftSchema>;

export const cancelPurchaseSchema = z.object({
  purchase_id: uuid,
  reason: z
    .string()
    .trim()
    .min(1, "سبب الإلغاء مطلوب")
    .max(500, "السبب طويل جداً"),
});
export type CancelPurchaseInput = z.infer<typeof cancelPurchaseSchema>;

/**
 * Client-side preview of the money. The database is authoritative — this only
 * drives what the summary panel shows while the user types.
 */
export function calculatePurchaseTotals(
  items: { quantity: number | string; unit_cost: number | string }[],
  discount: number | string,
  paid: number | string,
) {
  const round = (value: number) => Math.round(value * 100) / 100;

  const subtotal = round(
    items.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const cost = Number(item.unit_cost) || 0;
      return sum + round(quantity * cost);
    }, 0),
  );

  const discountValue = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = round(subtotal - discountValue);
  const paidValue = Math.max(Number(paid) || 0, 0);
  const remaining = round(Math.max(total - paidValue, 0));

  const paymentStatus =
    paidValue <= 0 ? "UNPAID" : paidValue >= total ? "PAID" : "PARTIALLY_PAID";

  return {
    subtotal,
    discount: discountValue,
    total,
    paid: paidValue,
    remaining,
    paymentStatus,
    /** True when the entered payment exceeds the total — blocks submission. */
    overpaid: paidValue > total,
  } as const;
}
