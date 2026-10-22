import { z } from 'zod';

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    name: z.string().trim().min(1).max(100),
    password: z.string().min(8).max(72),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(1),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
  })
  .strict();

export const verifyResetTokenSchema = z.object({ token: z.string().min(1) }).strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8).max(72),
    confirmPassword: z.string(),
  })
  .strict()
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyResetTokenInput = z.infer<typeof verifyResetTokenSchema>;
