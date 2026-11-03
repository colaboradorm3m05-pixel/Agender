import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { formatCents } from "@/domain/money";
import { formatDateTime } from "@/domain/format";
import { addDays, instantToLocal, localToInstant, minutesToHHMM, todayIn } from "@/domain/time";
import { Alert, Card, cx, EmptyState, PageHeader, Stat } from "@/components/ui";
import { periodRange, PERIODS } from "@/lib/periods";
import { requireActor } from "@/server/session";
import { listPayments, PAYMENT_METHOD_LABELS } from "@/server/services/payments";
import { periodSummary } from "@/server/services/reports";
import { listAgenda } from "@/server/services/scheduling";
import { DeletePaymentButton, StandalonePaymentForm } from "./payment-client";

export const metadata: Metadata = { title: "Pagamentos" };

export default async function PaymentsPage(props: PageProps<"/painel/pagamentos">) {
  const { actor, company } = await requireActor("payments.manage");
  const sp = await props.searchParams;
  const tz = company.timezone;
  const db = getDb();
  const period = periodRange(typeof sp.periodo === "string" ? sp.periodo : undefined, tz);
  const today = todayIn(tz);
  const [{ rows, totalCents }, summary, recent] = await Promise.all([
    listPayments(db, actor, period.from, period.to),
    periodSummary(db, actor, period.from, period.to),
    listAgenda(db, actor, localToInstant(addDays(today, -14), 0, tz), localToInstant(addDays(today, 1), 0, tz)),
  ]);
  const payable = recent
    .filter((a) => a.status !== "cancelled" && a.paidCents < a.priceCents)
    .reverse()
    .slice(0, 40)
    .map((a) => ({
      id: a.id,
      label: `${formatDateTime(a.startsAt, tz)} · ${a.customerName} · ${a.serviceName} (falta ${formatCents(a.priceCents - a.paidCents)})`,
    }));
  const nowLocal = instantToLocal(new Date(), tz);

  return (
    <>
      <PageHeader title="Pagamentos" description="Controle do que foi recebido dos clientes." />
      <div className="mb-6">
        <Alert tone="neutral">
          Registrar um pagamento aqui <strong>não processa nenhuma cobrança</strong>: é apenas o controle manual do que a empresa já recebeu (dinheiro, Pix,
          maquininha etc.).
        </Alert>
      </div>

      <nav aria-label="Período" className="mb-4 flex flex-wrap gap-1">
        {Object.entries(PERIODS).map(([key, label]) => (
          <Link
            key={key}
            href={`/painel/pagamentos?periodo=${key}`}
            aria-current={period.key === key ? "true" : undefined}
            className={cx(
              "rounded-full border px-3 py-1 text-xs font-medium",
              period.key === key ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink-soft hover:bg-canvas",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Recebido (registrado)" value={formatCents(totalCents)} hint={period.label} />
        <Stat label="Serviços concluídos" value={formatCents(summary.completedCents)} hint="Valor dos atendimentos concluídos" />
        <Stat label="Agendado (a realizar)" value={formatCents(summary.scheduledCents)} hint="Atendimentos confirmados no período" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          {rows.length === 0 ? (
            <EmptyState title="Nenhum pagamento registrado no período" description="Registre pagamentos aqui ou na tela de cada agendamento." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-canvas text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Data</th>
                    <th className="px-4 py-2 font-medium">Referente a</th>
                    <th className="px-4 py-2 font-medium">Forma</th>
                    <th className="px-4 py-2 text-right font-medium">Valor</th>
                    <th className="px-4 py-2">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td className="tabular whitespace-nowrap px-4 py-2">{formatDateTime(p.paidAt, tz)}</td>
                      <td className="px-4 py-2">
                        {p.appointmentId ? (
                          <Link href={`/painel/agendamentos/${p.appointmentId}`} className="text-accent hover:underline">
                            {p.customerName} · {p.serviceName}
                          </Link>
                        ) : (
                          <span className="text-muted">{p.notes || "Sem agendamento vinculado"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">{PAYMENT_METHOD_LABELS[p.method]}</td>
                      <td className="tabular px-4 py-2 text-right font-medium">{formatCents(p.amountCents)}</td>
                      <td className="px-4 py-2 text-right">
                        <DeletePaymentButton id={p.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Card>
          <h2 className="mb-4 font-semibold">Registrar pagamento</h2>
          <StandalonePaymentForm
            appointments={payable}
            defaultDate={nowLocal.date}
            defaultTime={minutesToHHMM(nowLocal.minuteOfDay)}
            methods={Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Card>
      </div>
    </>
  );
}
