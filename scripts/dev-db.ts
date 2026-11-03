/**
 * PostgreSQL local para desenvolvimento, sem Docker. Deixe rodando em um
 * terminal: `npm run db:dev`. Dados persistem em .data/pg (ou ~/.agender no
 * Windows quando a pasta do projeto tem caminho longo).
 * Em produção use um PostgreSQL gerenciado (ver docs/deploy.md).
 */
import { startLocalPg } from "./lib/local-pg";

const port = Number(process.env.DEV_DB_PORT ?? 54320);

async function main() {
  const pg = await startLocalPg({ dataDir: ".data/pg", port, databases: ["agender"] });
  console.log(`PostgreSQL de desenvolvimento pronto: ${pg.url("agender")}`);
  console.log(`Dados em: ${pg.dataDir}. Ctrl+C para parar.`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
