import { z } from 'zod';
export const MIN_PASSWORD_LENGTH = 6;
export const PASSWORD_HELP = 'Kata sandi minimal 6 karakter.';
export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH, PASSWORD_HELP).max(256);
// Empty/omitted fields mean retain the existing password on an update.
export const optionalPasswordSchema = z.union([z.literal(''), passwordSchema]).optional();
