import { z } from "zod";
import { SEGMENTS } from "@/config/segments";
import { isValidTimeZone } from "@/domain/time";
import { ValidationError, zodFieldErrors } from "./errors";

/** Valida com zod e lança ValidationError com mensagens por campo. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(zodFieldErrors(result.error.issues));
  return result.data;
}

const trimmed = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`);
export const requiredText = (max: number, label = "Este campo") => trimmed(max).min(1, `${label} é obrigatório.`);
export const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const uuidSchema = z.string().uuid("Identificador inválido.");
export const segmentSchema = z.enum(SEGMENTS, { message: "Escolha um segmento válido." });
export const timeZoneSchema = z.string().refine(isValidTimeZone, "Fuso horário inválido.");
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.");

export const weeklyRangeSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440),
  })
  .refine((r) => r.startMinute < r.endMinute, { message: "O horário final deve ser depois do inicial." });

/** Lista de faixas semanais sem sobreposição dentro do mesmo dia. */
export const weeklyRangesSchema = z
  .array(weeklyRangeSchema)
  .max(70)
  .superRefine((ranges, ctx) => {
    for (let wd = 0; wd <= 6; wd++) {
      const day = ranges.filter((r) => r.weekday === wd).sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 1; i < day.length; i++) {
        if (day[i].startMinute < day[i - 1].endMinute) {
          ctx.addIssue({ code: "custom", message: "Há faixas de horário sobrepostas no mesmo dia.", path: [wd] });
          return;
        }
      }
    }
  });

export const emailSchema = z
  .string()
  .trim()
  .max(200)
  .email("E-mail inválido.")
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));
