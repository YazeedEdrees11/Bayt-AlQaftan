import { z } from "zod";

import {
  EXPENSE_PAYMENT_METHODS,
  FINANCIAL_ACCOUNT_TYPES,
  FINANCIAL_DIRECTIONS,
} from "@/types/finance";

/**
 * Client-side shape checks only. The rules that protect money — that an account
 * cannot go below zero, that a cash expense comes out of a cash account, that
 * only an administrator may correct the ledger — are enforced again inside the
 * database functions, which are the authority.
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

export const expenseSchema = z.object({
  expense_category_id: uuid,
  amount: money,
  expense_date: optionalDate,
  payment_method: z.enum(EXPENSE_PAYMENT_METHODS).default("CASH"),
  financial_account_id: uuid,
  description: z.string().trim().max(1000, "الوصف طويل جداً.").optional(),
  receipt_image_path: z.string().trim().max(400).optional(),
});

export const cancelExpenseSchema = z.object({
  expense_id: uuid,
  reason: z.string().trim().min(1, "سبب الإلغاء مطلوب.").max(500, "السبب طويل جداً."),
});

export const accountSchema = z.object({
  name: z.string().trim().min(2, "اسم الحساب مطلوب.").max(120, "الاسم طويل جداً."),
  account_type: z.enum(FINANCIAL_ACCOUNT_TYPES).default("CASH"),
  opening_balance: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0),
      "الرصيد الافتتاحي غير صحيح.",
    ),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
});

export const accountUpdateSchema = z.object({
  id: uuid,
  name: z.string().trim().min(2, "اسم الحساب مطلوب.").max(120, "الاسم طويل جداً."),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
});

export const transferSchema = z
  .object({
    from_account_id: uuid,
    to_account_id: uuid,
    amount: money,
    transfer_date: optionalDate,
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.from_account_id === value.to_account_id) {
      ctx.addIssue({
        code: "custom",
        path: ["to_account_id"],
        message: "لا يمكن التحويل من الحساب إلى نفسه.",
      });
    }
  });

export const adjustmentSchema = z.object({
  financial_account_id: uuid,
  amount: money,
  direction: z.enum(FINANCIAL_DIRECTIONS),
  // §67: an adjustment without a stated reason is exactly the untraceable edit
  // this record exists to prevent.
  reason: z.string().trim().min(3, "سبب التعديل مطلوب.").max(300, "السبب طويل جداً."),
  adjustment_date: optionalDate,
  notes: z.string().trim().max(500).optional(),
});

export type ExpenseInput = z.input<typeof expenseSchema>;
export type CancelExpenseInput = z.input<typeof cancelExpenseSchema>;
export type AccountInput = z.input<typeof accountSchema>;
export type AccountUpdateInput = z.input<typeof accountUpdateSchema>;
export type TransferInput = z.input<typeof transferSchema>;
export type AdjustmentInput = z.input<typeof adjustmentSchema>;
