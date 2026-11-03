/**
 * Regras de comissão (funções puras).
 *
 * - Escopo: profissional e/ou serviço; nulo significa "todos".
 * - Precedência: profissional+serviço > só profissional > só serviço > geral.
 * - Vigência por data local do atendimento (inclusiva nas duas pontas).
 * - Base: preço fotografado do atendimento. Percentual arredondado ao
 *   centavo mais próximo (meio centavo arredonda para cima).
 */
import { formatCents } from "./money";

export type CommissionRuleLike = {
  id: string;
  professionalId: string | null;
  serviceId: string | null;
  type: "percent" | "fixed";
  percentBasisPoints: number | null;
  fixedCents: number | null;
  validFrom: string;
  validTo: string | null;
};

export function specificity(rule: Pick<CommissionRuleLike, "professionalId" | "serviceId">): number {
  return (rule.professionalId ? 2 : 0) + (rule.serviceId ? 1 : 0);
}

export function isValidOn(rule: Pick<CommissionRuleLike, "validFrom" | "validTo">, date: string): boolean {
  return rule.validFrom <= date && (rule.validTo === null || rule.validTo >= date);
}

export function pickRule<R extends CommissionRuleLike>(
  rules: R[],
  target: { professionalId: string; serviceId: string; date: string },
): R | null {
  const candidates = rules.filter(
    (r) =>
      (r.professionalId === null || r.professionalId === target.professionalId) &&
      (r.serviceId === null || r.serviceId === target.serviceId) &&
      isValidOn(r, target.date),
  );
  candidates.sort((a, b) => specificity(b) - specificity(a));
  return candidates[0] ?? null;
}

export function computeCommission(rule: CommissionRuleLike, priceCents: number): { cents: number; description: string } {
  if (rule.type === "fixed") {
    const cents = rule.fixedCents ?? 0;
    return { cents, description: `Valor fixo de ${formatCents(cents)}` };
  }
  const bp = rule.percentBasisPoints ?? 0;
  const cents = Math.floor((priceCents * bp + 5000) / 10000);
  return { cents, description: `${formatPercent(bp)} de ${formatCents(priceCents)}` };
}

export function formatPercent(basisPoints: number): string {
  return `${(basisPoints / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** "40" / "37,5" → pontos-base. */
export function parsePercentToBasisPoints(input: string): number | null {
  const m = /^(\d{1,3})(?:[,.](\d{1,2}))?$/.exec(input.trim().replace("%", "").trim());
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
  return bp <= 10000 ? bp : null;
}
