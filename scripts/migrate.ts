/** Aplica as migrações versionadas em ./drizzle no banco de DATABASE_URL. */
import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/db";

async function main() {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("Migrações aplicadas.");
}

main()
  .catch((err) => {
    console.error("Falha ao migrar:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
