import { addDays, daysBetween } from "@/domain/time";
import { customRange, periodRange } from "./periods";

const MAX_DAYS = 366;

/**
 * Intervalo do relatório a partir de ?de=AAAA-MM-DD&ate=AAAA-MM-DD (datas
 * locais, inclusivas). Padrão: mês atual. Intervalos inválidos ou maiores que
 * um ano voltam ao padrão e geram aviso.
 */
export function reportRange(sp: Record<string, string | string[] | undefined>, timeZone: string) {
  const de = typeof sp.de === "string" ? sp.de : undefined;
  const ate = typeof sp.ate === "string" ? sp.ate : undefined;
  const custom = customRange(de, ate, timeZone);
  if (custom && daysBetween(custom.startDate, custom.endDate) < MAX_DAYS) {
    return { ...custom, warning: null as string | null };
  }
  const month = periodRange("mes", timeZone);
  return {
    from: month.from,
    to: month.to,
    startDate: month.startDate,
    endDate: addDays(month.endDateExclusive, -1),
    warning: de || ate ? "Período inválido ou maior que 1 ano; mostrando o mês atual." : null,
  };
}
