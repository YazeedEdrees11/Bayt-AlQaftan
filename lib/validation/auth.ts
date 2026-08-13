import { z } from "zod";

import { USER_ROLES } from "@/lib/permissions/roles";
import type { UserRole } from "@/types/auth";

/**
 * Shared Zod schemas. The same schema validates the form in the browser and
 * the payload again inside the Server Action — the client-side pass is only a
 * convenience, never the security boundary.
 */

const email = z
  .string()
  .min(1, "البريد الإلكتروني مطلوب")
  .email("صيغة البريد الإلكتروني غير صحيحة")
  .transform((value) => value.trim().toLowerCase());

const fullName = z
  .string()
  .min(1, "الاسم الكامل مطلوب")
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(2, "الاسم الكامل قصير جداً")
      .max(120, "الاسم الكامل طويل جداً"),
  );

const password = z
  .string()
  .min(1, "كلمة المرور مطلوبة")
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
  .max(72, "كلمة المرور طويلة جداً");

const role = z.enum(USER_ROLES as unknown as [UserRole, ...UserRole[]], {
  errorMap: () => ({ message: "الدور المحدد غير صحيح" }),
});

export const loginSchema = z.object({
  email,
  // Login only checks presence: length rules belong to user creation.
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  full_name: fullName,
  email,
  password,
  role,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  id: z.string().uuid("معرّف المستخدم غير صحيح"),
  full_name: fullName,
  role,
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetUserPasswordSchema = z.object({
  id: z.string().uuid("معرّف المستخدم غير صحيح"),
  password,
});
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;

export const setUserActiveSchema = z.object({
  id: z.string().uuid("معرّف المستخدم غير صحيح"),
  is_active: z.boolean(),
});
export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;

export const updateProfileSchema = z.object({
  full_name: fullName,
  avatar_url: z
    .string()
    .trim()
    .max(500, "الرابط طويل جداً")
    .url("يجب إدخال رابط صحيح للصورة")
    .or(z.literal(""))
    .transform((value) => (value === "" ? null : value))
    .nullable(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
