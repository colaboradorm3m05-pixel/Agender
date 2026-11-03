import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

const globalForDb = globalThis as unknown as { __agenderPool?: Pool; __agenderDb?: Database };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida. Veja .env.example.");
  return new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
}

/** Conexão compartilhada (reaproveitada no hot-reload de desenvolvimento). */
export function getDb(): Database {
  if (!globalForDb.__agenderDb) {
    globalForDb.__agenderPool = createPool();
    globalForDb.__agenderDb = drizzle(globalForDb.__agenderPool, { schema });
  }
  return globalForDb.__agenderDb;
}

export async function closeDb() {
  await globalForDb.__agenderPool?.end();
  globalForDb.__agenderPool = undefined;
  globalForDb.__agenderDb = undefined;
}

export { schema };
