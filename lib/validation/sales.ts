import { z } from "zod";

import { SALE_PAYMENT_METHODS } from "@/types/sales";
import type { SalePaymentMethod } from "@/types/sales";

/**
 * Zod schemas for customers and sales.
 *
 * Totals never travel in a payload: the database recomputes subtotal, total,
 * cost, paid and remaining from the items. Anything the browser calculates is
 * a preview for the cashier.
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
    .refine((value) => value <= 99_999_999.99, { message: `${label} كبير جداً` });

const quantity = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === "string" ? value.trim() : value))
  .refine((value) => value !== "" && !Number.isNaN(Number(value)), {
    message: "الكمية يجب أن تكون رقماً",
  })
  .transform((value) => Number(value))
  .refine((value) => Number.isInteger(value), {
    message: "الكمية يجب أن تكون رقماً صحيحاً",
  })
  .refine((value) => value > 0, { message: "الكمية يجب أن تكون أكبر من صفر" })
  .refine((value) => value <= 1_000_000, { message: "الكمية كبيرة جداً" });

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} طويل جداً`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? undefined);

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

const paymentMethod = z.enum(
  SALE_PAYMENT_METHODS as unknown as [SalePaymentMethod, ...SalePaymentMethod[]],
  { errorMap: () => ({ message: "طريقة الدفع غير صحيحة" }) },
);

/* -------------------------------------------------------------------------- */
/*                                 Customers                                  */
/* -------------------------------------------------------------------------- */

/** Only the name is required — a walk-in becoming a regular starts with that. */
export const customerSchema = z.object({
  name: z
    .string()
    .min(1, "اسم العميل مطلوب")
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(2, "اسم العميل قصير جداً").max(160, "الاسم طويل جداً")),
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
export type CustomerInput = z.infer<typeof customerSchema>;

export const customerUpdateSchema = customerSchema.extend({ id: uuid });
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

/* -------------------------------------------------------------------------- */
/*                                  Payments                                  */
/* -------------------------------------------------------------------------- */

function checkBankFields(
  value: {
    payment_method: SalePaymentMethod;
    bank_name?: string | undefined;
    transfer_reference?: string | undefined;
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
  amount: money("المبلغ", { min: 0.01 }),
  payment_date: isoDate,
  bank_name: optionalText(120, "اسم البنك"),
  transfer_reference: optionalText(120, "رقم التحويل"),
  receipt_image_path: optionalText(400, "مسار الإيصال"),
  notes: optionalText(500, "الملاحظات"),
});

/** One tender line taken at the till. A sale may carry several. */
export const salePaymentLineSchema = paymentBase.superRefine(checkBankFields);
export type SalePaymentLineInput = z.infer<typeof salePaymentLineSchema>;

/** A later payment settling an outstanding sale. */
export const salePaymentSchema = paymentBase
  .extend({ sale_id: uuid })
  .superRefine(checkBankFields);
export type SalePaymentInput = z.infer<typeof salePaymentSchema>;

/* -------------------------------------------------------------------------- */
/*                                   Sales                                    */
/* -------------------------------------------------------------------------- */

export const saleItemSchema = z.object({
  variant_id: uuid,
  quantity,
  /** Overrides the variant's list price for this sale only. */
  unit_price: money("سعر البيع"),
});
export type SaleItemInput = z.infer<typeof saleItemSchema>;

export const CREATABLE_SALE_STATUSES = ["DRAFT", "COMPLETED"] as const;
export type CreatableSaleStatus = (typeof CREATABLE_SALE_STATUSES)[number];

export const createSaleSchema = z.object({
  /** Omitted or null means a walk-in — no customer record is created. */
  customer_id: uuid.nullable().optional().transform((v) => v ?? undefined),
  sale_date: isoDate,
  discount: money("الخصم").default(0),
  notes: optionalText(1000, "الملاحظات"),
  items: z
    .array(saleItemSchema)
    .min(1, "يجب إضافة منتج واحد على الأقل")
    .max(200, "عدد المنتجات كبير جداً"),
  /** Zero, one, or several tenders (cash + transfer on the same sale). */
  payments: z.array(salePaymentLineSchema).default([]),
  status: z
    .enum(CREATABLE_SALE_STATUSES as unknown as [
      CreatableSaleStatus,
      ...CreatableSaleStatus[],
    ])
    .default("COMPLETED"),
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const completeSaleSchema = z.object({
  sale_id: uuid,
  payments: z.array(salePaymentLineSchema).default([]),
});
export type CompleteSaleInput = z.infer<typeof completeSaleSchema>;

export const cancelSaleSchema = z.object({
  sale_id: uuid,
  reason: z
    .string()
    .trim()
    .min(1, "سبب الإلغاء مطلوب")
    .max(500, "السبب طويل جداً"),
});
export type CancelSaleInput = z.infer<typeof cancelSaleSchema>;

export const deleteDraftSaleSchema = z.object({ sale_id: uuid });

/* -------------------------------------------------------------------------- */
/*                              Client preview                                */
/* -------------------------------------------------------------------------- */

/**
 * Till-side preview of the money. The database is authoritative; this only
 * drives what the cashier sees while ringing items up.
 */
export function calculateSaleTotals(
  items: {
    quantity: number | string;
    unit_price: number | string;
    unit_cost: number | string;
  }[],
  discount: number | string,
  paid: number | string,
) {
  const round = (value: number) => Math.round(value * 100) / 100;

  const subtotal = round(
    items.reduce(
      (sum, item) =>
        sum + round((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)),
      0,
    ),
  );
  const cost = round(
    items.reduce(
      (sum, item) =>
        sum + round((Number(item.quantity) || 0) * (Number(item.unit_cost) || 0)),
      0,
    ),
  );

  const discountValue = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = round(subtotal - discountValue);
  const paidValue = Math.max(Number(paid) || 0, 0);
  const remaining = round(Math.max(total - paidValue, 0));

  // Profit is measured against what the customer actually pays, so the
  // discount comes off the revenue before the cost is subtracted.
  const grossProfit = round(total - cost);
  const grossMargin = total > 0 ? round((grossProfit / total) * 100) : 0;

  const paymentStatus =
    paidValue <= 0 ? "UNPAID" : paidValue >= total ? "PAID" : "PARTIALLY_PAID";

  return {
    subtotal,
    cost,
    discount: discountValue,
    total,
    paid: paidValue,
    remaining,
    grossProfit,
    grossMargin,
    paymentStatus,
    overpaid: paidValue > total,
  } as const;
}
