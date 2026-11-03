/** Verifica que migrar → reverter (down) → migrar de novo funciona, num banco descartável. */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { startLocalPg } from "./lib/local-pg";

async function main() {
  const pg = await startLocalPg({ dataDir: ".data/pg-rollback", port: 54331, ephemeral: true, databases: ["rb"] });
  const pool = new Pool({ connectionString: pg.url("rb") });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    for (const f of ["0003_commission_no_overlap", "0002_commissions", "0001_no_overlap", "0000_init"]) {
      await pool.query(readFileSync(`drizzle/rollback/${f}.down.sql`, "utf8"));
    }
    await pool.query("delete from drizzle.__drizzle_migrations");
    const left = await pool.query("select count(*)::int as n from pg_tables where schemaname = 'public'");
    console.log("tabelas restantes após rollback:", left.rows[0].n);
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("migração reaplicada com sucesso");
  } finally {
    await pool.end();
    await pg.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
