/**
 * Normalização de telefone para evitar duplicidade de clientes.
 * Resultado: somente dígitos, com DDI. Números brasileiros (10/11 dígitos)
 * recebem o prefixo 55.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  if (input.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

export function formatPhone(normalized: string): string {
  if (normalized.startsWith("55") && (normalized.length === 12 || normalized.length === 13)) {
    const ddd = normalized.slice(2, 4);
    const rest = normalized.slice(4);
    const split = rest.length === 9 ? 5 : 4;
    return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
  }
  return "+" + normalized;
}

/** Normaliza nomes para comparação (sem acento, minúsculo, espaços simples). */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
