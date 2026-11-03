/** Valores monetários são sempre inteiros em centavos. */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/**
 * Converte texto digitado ("35", "35,5", "35,50", "1.234,56", "R$ 40") em centavos
 * usando apenas aritmética inteira. Retorna null se inválido.
 */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/R\$\s?/i, "").replace(/\s/g, "");
  if (!cleaned) return null;
  // Formato brasileiro: ponto = milhar, vírgula = decimal. Aceita ponto decimal se não houver vírgula.
  let normalized: string;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  } else {
    normalized = cleaned;
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const reais = Number(match[1]);
  const centavos = Number((match[2] ?? "0").padEnd(2, "0"));
  const cents = reais * 100 + centavos;
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToInput(cents: number): string {
  const reais = Math.floor(cents / 100);
  const c = String(cents % 100).padStart(2, "0");
  return `${reais},${c}`;
}
