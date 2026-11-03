/** Sobe um PostgreSQL real e descartável para os testes e aplica as migrações. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { startLocalPg, type LocalPg } from "../scripts/lib/local-pg";

let pg: LocalPg | undefined;

export async function setup() {
  pg = await startLocalPg({ dataDir: ".data/pg-test", port: 54329, ephemeral: true, databases: ["agender_test"] });
  const pool = new Pool({ connectionString: pg.url("agender_test") });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}

export async function teardown() {
  await pg?.stop();
}
