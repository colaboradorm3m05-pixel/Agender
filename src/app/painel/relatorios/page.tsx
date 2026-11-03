import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { formatCents } from "@/domain/money";
import { formatDate, formatTime } from "@/domain/format";
import { addDays, todayIn } from "@/domain/time";
import { Alert, buttonClass, Card, EmptyState, inputClass, PageHeader, Stat } from "@/components/ui";
import { reportRange } from "@/lib/report-range";
import { can } from "@/server/permissions";
import { requireActor } from "@/server/session";
import { performanceReport } from "@/server/services/reports";
import { listProfessionals } from "@/server/services/staff";

export const metadata: Metadata = { title: "Relatórios" };

export default async function ReportsPage(props: PageProps<"/painel/relatorios">) {
  const { actor, company } = await requireActor("reports.view_own");
  const sp = await props.searchParams;
  const tz = company.timezone;
  const db = getDb();
  const range = reportRange(sp, tz);
  const isOwner = can(actor, "reports.view");
  const pros = isOwner ? await listProfessionals(db, actor, { includeInactive: true }) : [];
  const requestedPro = typeof sp.profissional === "string" && pros.some((p) => p.id === sp.profissional) ? sp.profissional : "";
  const report = await performanceReport(db, actor, range.from, range.to, requestedPro || null);
  const showReceived = report.totals.receivedCents !== null;

  const params = new URLSearchParams({ de: range.startDate, ate: range.endDate, ...(requestedPro ? { profissional: requestedPro } : {}) });
  const today = todayIn(tz);
  const shortcuts = [
    { label: "Este mês", de: `${today.slice(0, 8)}01`, ate: today },
    { label: "Últimos 7 dias", de: addDays(today, -6), ate: today },
    { label: "Últimos 30 dias", de: addDays(today, -29), ate: today },
  ];

  return (
    <>
      <PageHeader
        title={isOwner ? "Relatórios" : "Meus atendimentos"}
        description={isOwner ? "Desempenho e comissões por período e profissional." : "Seus atendimentos concluídos e comissões no período."}
        actions={
          <>
            {can(actor, "commissions.manage") ? (
              <Link href="/painel/relatorios/comissoes" className={buttonClass("secondary")}>
                Regras de comissão
              </Link>
            ) : null}
            <a href={`/painel/relatorios/exportar?${params.toString()}`} className={buttonClass("secondary")}>
              Exportar CSV
            </a>
          </>
        }
      />

      <Card className="mb-6">
        <form action="/painel/relatorios" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="de" className="mb-1 block text-xs font-medium text-muted">
              De
            </label>
            <input id="de" type="date" name="de" defaultValue={range.startDate} className={`${inputClass.replace("w-full", "")} w-40`} />
          </div>
          <div>
            <label htmlFor="ate" className="mb-1 block text-xs font-medium text-muted">
              Até
            </label>
            <input id="ate" type="date" name="ate" defaultValue={range.endDate} className={`${inputClass.replace("w-full", "")} w-40`} />
          </div>
          {isOwner ? (
            <div>
              <label htmlFor="profissional" className="mb-1 block text-xs font-medium text-muted">
                Profissional
              </label>
              <select id="profissional" name="profissional" defaultValue={requestedPro} className={`${inputClass.replace("w-full", "")} w-48`}>
                <option value="">Todos</option>
                {pros.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.active ? "" : " (inativo)"}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button type="submit" className={buttonClass("primary")}>
            Aplicar
          </button>
          <div className="flex flex-wrap gap-1">
            {shortcuts.map((s) => (
              <Link
                key={s.label}
                href={`/painel/relatorios?de=${s.de}&ate=${s.ate}${requestedPro ? `&profissional=${requestedPro}` : ""}`}
                className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-soft hover:bg-canvas"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </form>
        {range.warning ? (
          <div className="mt-3">
            <Alert tone="warn">{range.warning}</Alert>
          </div>
        ) : null}
      </Card>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Atendimentos concluídos" value={report.totals.completedCount} hint={`${report.totals.noShowCount} falta(s) · ${report.totals.cancelledCount} cancelado(s)`} />
        <Stat label="Valor dos serviços concluídos" value={formatCents(report.totals.completedCents)} />
        <Stat label="Comissões" value={formatCents(report.totals.commissionCents)} hint="Calculadas na conclusão de cada atendimento." />
        {showReceived ? (
          <Stat label="Recebido" value={formatCents(report.totals.receivedCents ?? 0)} hint="Pagamentos registrados para os atendimentos do período." />
        ) : null}
      </div>

      {report.rows.length === 0 ? (
        <EmptyState title="Nenhum atendimento no período" description="Ajuste as datas ou o profissional." />
      ) : (
        <>
          {isOwner ? (
            <section className="mb-8">
              <h2 className="mb-3 font-semibold">Por profissional</h2>
              <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-canvas text-left text-xs text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Profissional</th>
                      <th className="px-4 py-2 text-right font-medium">Concluídos</th>
                      <th className="px-4 py-2 text-right font-medium">Faltas</th>
                      <th className="px-4 py-2 text-right font-medium">Cancelados</th>
                      <th className="px-4 py-2 text-right font-medium">Valor concluído</th>
                      <th className="px-4 py-2 text-right font-medium">Comissão</th>
                      {showReceived ? <th className="px-4 py-2 text-right font-medium">Recebido</th> : null}
                    </tr>
                  </thead>
                  <tbody className="tabular divide-y divide-line">
                    {report.rows.map((r) => (
                      <tr key={r.professionalId}>
                        <td className="px-4 py-2 font-medium">
                          <Link href={`/painel/relatorios?${new URLSearchParams({ de: range.startDate, ate: range.endDate, profissional: r.professionalId })}`} className="text-accent hover:underline">
                            {r.professionalName}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-right">{r.completedCount}</td>
                        <td className="px-4 py-2 text-right">{r.noShowCount}</td>
                        <td className="px-4 py-2 text-right">{r.cancelledCount}</td>
                        <td className="px-4 py-2 text-right">{formatCents(r.completedCents)}</td>
                        <td className="px-4 py-2 text-right">{formatCents(r.commissionCents)}</td>
                        {showReceived ? <td className="px-4 py-2 text-right">{formatCents(r.receivedCents ?? 0)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="mb-3 font-semibold">Atendimentos concluídos</h2>
            {report.completed.length === 0 ? (
              <p className="text-sm text-muted">Nenhum atendimento concluído no período.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-canvas text-left text-xs text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Data</th>
                      <th className="px-4 py-2 font-medium">Cliente</th>
                      <th className="px-4 py-2 font-medium">Serviço</th>
                      {isOwner ? <th className="px-4 py-2 font-medium">Profissional</th> : null}
                      <th className="px-4 py-2 text-right font-medium">Valor</th>
                      <th className="px-4 py-2 text-right font-medium">Comissão</th>
                      <th className="px-4 py-2 font-medium">Regra aplicada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {report.completed.map((l) => (
                      <tr key={l.id}>
                        <td className="tabular whitespace-nowrap px-4 py-2">
                          <Link href={`/painel/agendamentos/${l.id}`} className="text-accent hover:underline">
                            {formatDate(l.startsAt, tz)} {formatTime(l.startsAt, tz)}
                          </Link>
                        </td>
                        <td className="px-4 py-2">{l.customerName}</td>
                        <td className="px-4 py-2">{l.serviceName}</td>
                        {isOwner ? <td className="px-4 py-2">{l.professionalName}</td> : null}
                        <td className="tabular px-4 py-2 text-right">{formatCents(l.priceCents)}</td>
                        <td className="tabular px-4 py-2 text-right font-medium">{formatCents(l.commissionCents)}</td>
                        <td className="px-4 py-2 text-xs text-muted">{l.commissionDescription ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
