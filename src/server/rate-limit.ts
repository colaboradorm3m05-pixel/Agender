/**
 * Limite de requisições com contador no PostgreSQL (funciona com várias
 * instâncias). A chave guarda apenas o hash do identificador (ex.: IP), não o
 * valor em si.
 */
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { DbOrTx } from "@/db";
import { RateLimitError } from "./errors";

export type RateLimitRule = { bucket: string; limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  publicBooking: { bucket: "booking", limit: 8, windowSeconds: 600 },
  publicSlots: { bucket: "slots", limit: 120, windowSeconds: 600 },
  manageLookup: { bucket: "manage", limit: 30, windowSeconds: 600 },
  manageChange: { bucket: "manage-change", limit: 10, windowSeconds: 600 },
} satisfies Record<string, RateLimitRule>;

export async function hitRateLimit(db: DbOrTx, rule: RateLimitRule, identifier: string): Promise<{ allowed: boolean; count: number }> {
  const key = `${rule.bucket}:${createHash("sha256").update(identifier).digest("hex").slice(0, 32)}`;
  const result = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, count, reset_at)
    values (${key}, 1, now() + make_interval(secs => ${rule.windowSeconds}))
    on conflict (key) do update set
      count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
    returning count
  `);
  const count = Number(result.rows[0]?.count ?? 0);
  return { allowed: count <= rule.limit, count };
}

export async function enforceRateLimit(db: DbOrTx, rule: RateLimitRule, identifier: string): Promise<void> {
  const { allowed } = await hitRateLimit(db, rule, identifier);
  if (!allowed) throw new RateLimitError();
}

/** Limpeza periódica de contadores expirados (pode rodar em um cron). */
export async function purgeExpiredRateLimits(db: DbOrTx) {
  await db.execute(sql`delete from rate_limits where reset_at < now() - interval '1 hour'`);
}
