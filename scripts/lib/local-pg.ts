/**
 * PostgreSQL local (desenvolvimento e testes) usando os binários oficiais
 * distribuídos pelos pacotes @embedded-postgres/<plataforma>. Não substitui um
 * banco gerenciado em produção.
 *
 * No Windows, o PostgreSQL falha se o caminho dos binários/dados passar de
 * ~260 caracteres. Quando a pasta do projeto é longa, os binários e os dados
 * são colocados em ~/.agender (caminho curto).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

const LONG_PATH = 120;

function platformPackage() {
  const platform = { win32: "windows", darwin: "darwin", linux: "linux" }[process.platform as string];
  if (!platform) throw new Error(`Plataforma não suportada: ${process.platform}`);
  return `@embedded-postgres/${platform}-${os.arch()}`;
}

async function resolveBinaries() {
  const pkg = (await import(platformPackage())) as { initdb: string; postgres: string; pg_ctl: string };
  let nativeDir = path.resolve(path.dirname(pkg.initdb), "..");
  if (process.platform === "win32" && nativeDir.length > LONG_PATH) {
    const target = path.join(os.homedir(), ".agender", "pg-" + hash(nativeDir));
    if (!existsSync(path.join(target, "bin", "postgres.exe"))) {
      mkdirSync(target, { recursive: true });
      cpSync(nativeDir, target, { recursive: true });
    }
    nativeDir = target;
  }
  const ext = process.platform === "win32" ? ".exe" : "";
  return {
    initdb: path.join(nativeDir, "bin", "initdb" + ext),
    postgres: path.join(nativeDir, "bin", "postgres" + ext),
    pgCtl: path.join(nativeDir, "bin", "pg_ctl" + ext),
  };
}

function hash(s: string) {
  return createHash("sha256").update(s).digest("hex").slice(0, 10);
}

/** Diretório de dados: o pedido, ou um equivalente curto no Windows. */
export function resolveDataDir(requested: string) {
  const abs = path.resolve(requested);
  if (process.platform === "win32" && abs.length > LONG_PATH) {
    return path.join(os.homedir(), ".agender", "data-" + hash(abs));
  }
  return abs;
}

export type LocalPg = { url: (db: string) => string; stop: () => Promise<void>; dataDir: string };

export async function startLocalPg(opts: {
  dataDir: string;
  port: number;
  /** Apaga os dados ao parar (testes). */
  ephemeral?: boolean;
  databases?: string[];
}): Promise<LocalPg> {
  const bins = await resolveBinaries();
  const dataDir = resolveDataDir(opts.dataDir);
  if (opts.ephemeral) rmSync(dataDir, { recursive: true, force: true });
  const password = "postgres";

  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    mkdirSync(dataDir, { recursive: true });
    const pwfile = path.join(os.tmpdir(), `agender-pw-${process.pid}`);
    writeFileSync(pwfile, password);
    const res = spawnSync(
      bins.initdb,
      ["-D", dataDir, "-U", "postgres", `--pwfile=${pwfile}`, "-A", "scram-sha-256", "-E", "UTF8", "--locale=C"],
      { encoding: "utf8" },
    );
    rmSync(pwfile, { force: true });
    if (res.status !== 0) {
      throw new Error(`initdb falhou: ${res.stderr || res.stdout}`);
    }
  }

  if (await portInUse(opts.port)) {
    throw new Error(`Porta ${opts.port} já está em uso (o banco já está rodando?).`);
  }

  const child: ChildProcess = spawn(
    bins.postgres,
    ["-D", dataDir, "-p", String(opts.port), "-c", "listen_addresses=localhost", "-c", "max_connections=100", "-c", "fsync=" + (opts.ephemeral ? "off" : "on")],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr?.on("data", (d) => {
    stderr += String(d);
    if (stderr.length > 20000) stderr = stderr.slice(-10000);
  });

  await waitForPort(opts.port, child, () => stderr);

  const url = (db: string) => `postgres://postgres:${password}@localhost:${opts.port}/${db}`;

  if (opts.databases?.length) {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: url("postgres") });
    await client.connect();
    for (const db of opts.databases) {
      const exists = await client.query("select 1 from pg_database where datname = $1", [db]);
      if (!exists.rowCount) await client.query(`create database "${db}"`);
    }
    await client.end();
  }

  const stop = async () => {
    if (child.exitCode === null) {
      // Desligamento limpo (encerra também os processos filhos do PostgreSQL).
      spawnSync(bins.pgCtl, ["stop", "-D", dataDir, "-m", "fast", "-w"], { encoding: "utf8" });
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 10000);
        child.once("exit", () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    if (opts.ephemeral) rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  };

  return { url, stop, dataDir };
}

function portInUse(port: number) {
  return new Promise<boolean>((resolve) => {
    const sock = net.connect(port, "localhost");
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
  });
}

async function waitForPort(port: number, child: ChildProcess, logs: () => string) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`PostgreSQL encerrou ao iniciar:\n${logs()}`);
    if (await portInUse(port)) {
      // A porta abre antes de aceitar conexões; aguarda o "ready".
      if (/ready to accept connections/.test(logs())) return;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`PostgreSQL não respondeu a tempo:\n${logs()}`);
}
