import { z } from "zod";

import {
  ADJUSTMENT_REASONS,
  ITEM_CONDITIONS,
  REFUND_METHODS,
  RETURN_REASONS,
  SETTLEMENT_METHODS,
} from "@/types/returns";

/**
 * Client-side shape checks only. Every rule that protects money or stock —
 * how much is still returnable, whether the goods are still on the shelf,
 * whether a refund exceeds the return — is enforced again inside the database
 * functions, which are the authority.
 */

const uuid = z.string().uuid("معرّف غير صالح.");
const money = z
  .string()
  .trim()
  .min(1, "المبلغ مطلوب.")
  .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, "أدخل مبلغاً صحيحاً أكبر من صفر.");
const optionalDate = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), "تاريخ غير صالح.");

/** Bank transfers must carry a bank and a reference, or the record is useless. */
function checkBankFields(
  value: { bank_name?: string; transfer_reference?: string } & Record<string, unknown>,
  ctx: z.RefinementCtx,
  methodKey: string,
  bankValue: string,
) {
  if (value[methodKey] !== bankValue) return;
  if (!value.bank_name?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["bank_name"],
      message: "اسم البنك مطلوب عند التحويل البنكي.",
    });
  }
  if (!value.transfer_reference?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["transfer_reference"],
      message: "رقم التحويل مطلوب عند التحويل البنكي.",
    });
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Returns                                   */
/* -------------------------------------------------------------------------- */

export const returnLineSchema = z.object({
  sale_item_id: uuid,
  quantity: z
    .string()
    .trim()
    .min(1, "الكمية مطلوبة.")
    .refine(
      (v) => Number.isInteger(Number(v)) && Number(v) > 0,
      "الكمية يجب أن تكون رقماً صحيحاً أكبر من صفر.",
    ),
  condition: z.enum(ITEM_CONDITIONS).default("GOOD"),
  reason: z.string().trim().max(500, "السبب طويل جداً.").optional(),
});

export const refundLineSchema = z
  .object({
    refund_method: z.enum(REFUND_METHODS).default("CASH"),
    amount: money,
    refund_date: optionalDate,
    bank_name: z.string().trim().max(120).optional(),
    transfer_reference: z.string().trim().max(120).optional(),
    receipt_image_path: z.string().trim().max(400).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) =>
    checkBankFields(value, ctx, "refund_method", "BANK_TRANSFER"),
  );

export const createReturnSchema = z.object({
  sale_id: uuid,
  return_date: optionalDate,
  reason: z.enum(RETURN_REASONS).optional(),
  notes: z.string().trim().max(1000, "الملاحظات طويلة جداً.").optional(),
  items: z.array(returnLineSchema).min(1, "اختر منتجاً واحداً على الأقل للإرجاع."),
  refunds: z.array(refundLineSchema).default([]),
});

export const addRefundSchema = z
  .object({
    return_id: uuid,
    refund_method: z.enum(REFUND_METHODS).default("CASH"),
    amount: money,
    refund_date: optionalDate,
    bank_name: z.string().trim().max(120).optional(),
    transfer_reference: z.string().trim().max(120).optional(),
    receipt_image_path: z.string().trim().max(400).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) =>
    checkBankFields(value, ctx, "refund_method", "BANK_TRANSFER"),
  );

export const cancelReturnSchema = z.object({
  return_id: uuid,
  reason: z.string().trim().min(1, "سبب الإلغاء مطلوب.").max(500, "السبب طويل جداً."),
});

/* -------------------------------------------------------------------------- */
/*                                 Exchanges                                  */
/* -------------------------------------------------------------------------- */

export const exchangeReturnedLineSchema = z.object({
  sale_item_id: uuid,
  quantity: z
    .string()
    .trim()
    .min(1, "الكمية مطلوبة.")
    .refine(
      (v) => Number.isInteger(Number(v)) && Number(v) > 0,
      "الكمية يجب أن تكون رقماً صحيحاً أكبر من صفر.",
    ),
  condition: z.enum(ITEM_CONDITIONS).default("GOOD"),
});

export const exchangeNewLineSchema = z.object({
  variant_id: uuid,
  quantity: z
    .string()
    .trim()
    .min(1, "الكمية مطلوبة.")
    .refine(
      (v) => Number.isInteger(Number(v)) && Number(v) > 0,
      "الكمية يجب أن تكون رقماً صحيحاً أكبر من صفر.",
    ),
  unit_price: z
    .string()
    .trim()
    .min(1, "السعر مطلوب.")
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, "أدخل سعراً صحيحاً."),
});

export const createExchangeSchema = z
  .object({
    sale_id: uuid,
    exchange_date: optionalDate,
    notes: z.string().trim().max(1000, "الملاحظات طويلة جداً.").optional(),
    returned_items: z
      .array(exchangeReturnedLineSchema)
      .min(1, "اختر المنتج المرتجع."),
    new_items: z.array(exchangeNewLineSchema).min(1, "اختر المنتج البديل."),
    reason: z.enum(RETURN_REASONS).optional(),
    settlement_method: z.enum(SETTLEMENT_METHODS).default("CASH"),
    bank_name: z.string().trim().max(120).optional(),
    transfer_reference: z.string().trim().max(120).optional(),
    receipt_image_path: z.string().trim().max(400).optional(),
  })
  .superRefine((value, ctx) =>
    checkBankFields(value, ctx, "settlement_method", "BANK_TRANSFER"),
  );

export const cancelExchangeSchema = z.object({
  exchange_id: uuid,
  reason: z.string().trim().min(1, "سبب الإلغاء مطلوب.").max(500, "السبب طويل جداً."),
});

/* -------------------------------------------------------------------------- */
/*                            Inventory adjustments                           */
/* -------------------------------------------------------------------------- */

export const adjustmentLineSchema = z.object({
  variant_id: uuid,
  actual_quantity: z
    .string()
    .trim()
    .min(1, "الكمية الفعلية مطلوبة.")
    .refine(
      (v) => Number.isInteger(Number(v)) && Number(v) >= 0,
      "الكمية الفعلية غير صحيحة.",
    ),
  reason: z.string().trim().max(300).optional(),
});

export const createAdjustmentSchema = z.object({
  adjustment_date: optionalDate,
  reason: z.enum(ADJUSTMENT_REASONS).default("STOCK_COUNT"),
  notes: z.string().trim().max(1000, "الملاحظات طويلة جداً.").optional(),
  items: z.array(adjustmentLineSchema).min(1, "أضف منتجاً واحداً على الأقل."),
});

export const cancelAdjustmentSchema = z.object({
  adjustment_id: uuid,
  reason: z.string().trim().min(1, "سبب الإلغاء مطلوب.").max(500, "السبب طويل جداً."),
});

export const recordDamageSchema = z.object({
  variant_id: uuid,
  quantity: z
    .string()
    .trim()
    .min(1, "الكمية مطلوبة.")
    .refine(
      (v) => Number.isInteger(Number(v)) && Number(v) > 0,
      "الكمية يجب أن تكون رقماً صحيحاً أكبر من صفر.",
    ),
  notes: z.string().trim().max(500).optional(),
});

export type ReturnLineInput = z.input<typeof returnLineSchema>;
export type RefundLineInput = z.input<typeof refundLineSchema>;
export type CreateReturnInput = z.input<typeof createReturnSchema>;
export type AddRefundInput = z.input<typeof addRefundSchema>;
export type CancelReturnInput = z.input<typeof cancelReturnSchema>;
export type ExchangeReturnedLineInput = z.input<typeof exchangeReturnedLineSchema>;
export type ExchangeNewLineInput = z.input<typeof exchangeNewLineSchema>;
export type CreateExchangeInput = z.input<typeof createExchangeSchema>;
export type CancelExchangeInput = z.input<typeof cancelExchangeSchema>;
export type AdjustmentLineInput = z.input<typeof adjustmentLineSchema>;
export type CreateAdjustmentInput = z.input<typeof createAdjustmentSchema>;
export type CancelAdjustmentInput = z.input<typeof cancelAdjustmentSchema>;
export type RecordDamageInput = z.input<typeof recordDamageSchema>;
