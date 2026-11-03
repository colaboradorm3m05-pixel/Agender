import { getDb } from "@/db";
import { formatDate, formatTime } from "@/domain/format";
import { centsForCsv, toCsv } from "@/lib/csv";
import { reportRange } from "@/lib/report-range";
import { logError } from "@/server/action-result";
import { can } from "@/server/permissions";
import { getActorContext } from "@/server/session";
import { performanceReport } from "@/server/services/reports";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Exporta os atendimentos concluídos do período (com comissão) em CSV. */
export async function GET(request: Request) {
  const ctx = await getActorContext();
  if (!ctx?.actor || !ctx.company) return new Response("Não autorizado", { status: 401 });
  if (!can(ctx.actor, "reports.view_own")) return new Response("Proibido", { status: 403 });
  try {
    const url = new URL(request.url);
    const sp = Object.fromEntries(url.searchParams.entries());
    const tz = ctx.company.timezone;
    const range = reportRange(sp, tz);
    const report = await performanceReport(getDb(), ctx.actor, range.from, range.to, UUID_RE.test(sp.profissional ?? "") ? sp.profissional : null);
    const showPaid = report.totals.receivedCents !== null;
    const header = ["Data", "Hora", "Cliente", "Serviço", "Profissional", "Valor (R$)", "Comissão (R$)", "Regra aplicada"];
    if (showPaid) header.push("Pago (R$)");
    const rows = report.completed.map((l) => {
      const row = [
        formatDate(l.startsAt, tz),
        formatTime(l.startsAt, tz),
        l.customerName,
        l.serviceName,
        l.professionalName,
        centsForCsv(l.priceCents),
        centsForCsv(l.commissionCents),
        l.commissionDescription ?? "",
      ];
      if (showPaid) row.push(centsForCsv(l.paidCents));
      return row;
    });
    const filename = `atendimentos-${range.startDate}-a-${range.endDate}.csv`;
    return new Response(toCsv([header, ...rows]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logError(err);
    return new Response("Não foi possível gerar o arquivo.", { status: 500 });
  }
}
