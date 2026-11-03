import { createHash, randomBytes, randomInt } from "node:crypto";

/** Token secreto não previsível (256 bits), seguro para URLs. */
export function generateSecretToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Guardamos só o hash: um vazamento do banco não expõe links válidos. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Código de reserva legível (ex.: AG-7KQ2MX). Serve para referência; não dá acesso. */
export function generatePublicCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `AG-${code}`;
}

export function looksLikeToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
