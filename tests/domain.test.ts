import { describe, expect, it } from "vitest";
import { formatCents, parseMoneyToCents } from "@/domain/money";
import { normalizeName, normalizePhone } from "@/domain/phone";
import { isValidSlug, slugify } from "@/domain/slug";
import { generatePublicCode, generateSecretToken, hashToken, looksLikeToken } from "@/domain/tokens";

describe("dinheiro em centavos", () => {
  it.each([
    ["35", 3500],
    ["35,5", 3550],
    ["35,50", 3550],
    ["R$ 1.234,56", 123456],
    ["0,10", 10],
    ["40.5", 4050],
    ["1.000", 100000],
  ])("%s → %i", (input, cents) => expect(parseMoneyToCents(input)).toBe(cents));

  it.each(["", "abc", "1,234", "-5", "1,2,3"])("rejeita %s", (input) => expect(parseMoneyToCents(input)).toBeNull());

  it("formata em reais", () => expect(formatCents(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56"));
});

describe("telefone", () => {
  it("normaliza formatos brasileiros para o mesmo valor", () => {
    expect(normalizePhone("(11) 98765-4321")).toBe("5511987654321");
    expect(normalizePhone("11987654321")).toBe("5511987654321");
    expect(normalizePhone("+55 11 98765-4321")).toBe("5511987654321");
    expect(normalizePhone("011 98765-4321")).toBe("5511987654321");
  });
  it("rejeita números incompletos", () => expect(normalizePhone("98765-4321")).toBeNull());
  it("compara nomes sem acento/caixa", () => expect(normalizeName("  JOÃO  da Silva ")).toBe("joao da silva"));
});

describe("slug e tokens", () => {
  it("gera slug válido", () => {
    expect(slugify("Barbearia do Zé & Cia")).toBe("barbearia-do-ze-cia");
    expect(isValidSlug("barbearia-do-ze-cia")).toBe(true);
    expect(isValidSlug("painel")).toBe(false);
  });
  it("token é imprevisível e só o hash é guardado", () => {
    const a = generateSecretToken();
    const b = generateSecretToken();
    expect(a).not.toBe(b);
    expect(looksLikeToken(a)).toBe(true);
    expect(hashToken(a)).toHaveLength(64);
    expect(generatePublicCode()).toMatch(/^AG-[A-Z2-9]{6}$/);
  });
});

describe("CSV", async () => {
  const { toCsv, csvCell, centsForCsv } = await import("@/lib/csv");
  it("usa ; com BOM e escapa aspas e quebras", () => {
    expect(toCsv([["a", 'b"c'], ["x;y", 1]])).toBe('﻿a;"b""c"\r\n"x;y";1\r\n');
  });
  it("neutraliza fórmulas (CSV injection)", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+55 11")).toBe("'+55 11");
    expect(csvCell("@x")).toBe("'@x");
  });
  it("formata centavos", () => {
    expect(centsForCsv(4550)).toBe("45,50");
    expect(centsForCsv(5)).toBe("0,05");
    expect(centsForCsv(null)).toBe("");
  });
});
