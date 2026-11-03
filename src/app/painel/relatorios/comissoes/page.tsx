import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { formatPercent } from "@/domain/commission";
import { formatCents } from "@/domain/money";
import { todayIn } from "@/domain/time";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireActor } from "@/server/session";
import { listServices } from "@/server/services/catalog";
import { listCommissionRules } from "@/server/services/commissions";
import { listProfessionals } from "@/server/services/staff";
import { EndRuleButton, NewRuleForm } from "./rule-forms";

export const metadata: Metadata = { title: "Regras de comissão" };

const fmt = (d: string) => d.split("-").reverse().join("/");

export default async function CommissionRulesPage() {
  const { actor, company } = await requireActor("commissions.manage");
  const db = getDb();
  const today = todayIn(company.timezone);
  const [rules, pros, svcs] = await Promise.all([
    listCommissionRules(db, actor),
    listProfessionals(db, actor, { includeInactive: true }),
    listServices(db, actor, { includeInactive: true }),
  ]);
  const current = rules.filter((r) => r.rule.validTo === null || r.rule.validTo >= today);
  const past = rules.filter((r) => r.rule.validTo !== null && r.rule.validTo < today);

  const scope = (r: (typeof rules)[number]) =>
    `${r.professionalName ?? "Todos os profissionais"} · ${r.serviceName ?? "todos os serviços"}`;
  const value = (r: (typeof rules)[number]) =>
    r.rule.type === "percent" ? `${formatPercent(r.rule.percentBasisPoints ?? 0)} do valor` : `${formatCents(r.rule.fixedCents ?? 0)} por atendimento`;
  const period = (r: (typeof rules)[number]) => `${fmt(r.rule.validFrom)} ${r.rule.validTo ? `a ${fmt(r.rule.validTo)}` : "em diante"}`;

  return (
    <>
      <Link href="/painel/relatorios" className="text-sm text-accent hover:underline">
        ← Relatórios
      </Link>
      <PageHeader
        title="Regras de comissão"
        description="A comissão é calculada e registrada quando o atendimento é marcado como concluído. Mudar regras nunca altera atendimentos já concluídos."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px] [&>*]:min-w-0">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-1 font-semibold">Como a regra é escolhida</h2>
            <ol className="list-decimal space-y-0.5 pl-5 text-sm text-ink-soft">
              <li>Regra do profissional para aquele serviço;</li>
              <li>senão, regra do profissional (todos os serviços);</li>
              <li>senão, regra do serviço (todos os profissionais);</li>
              <li>senão, regra geral. Sem regra vigente, a comissão é zero.</li>
            </ol>
            <p className="mt-2 text-xs text-muted">Vale a regra vigente na data do atendimento. Base de cálculo: preço do serviço registrado no agendamento.</p>
          </Card>
          <section>
            <h2 className="mb-3 font-semibold">Vigentes e futuras</h2>
            {current.length === 0 ? (
              <EmptyState title="Nenhuma regra cadastrada" description="Sem regras, atendimentos concluídos registram comissão zero." />
            ) : (
              <ul className="space-y-2">
                {current.map((r) => (
                  <li key={r.rule.id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{value(r)}</p>
                      <p className="text-xs text-muted">
                        {scope(r)} · {period(r)} {r.rule.validFrom > today ? <Badge tone="accent">Futura</Badge> : null}
                      </p>
                    </div>
                    {r.rule.validTo === null ? <EndRuleButton id={r.rule.id} defaultDate={r.rule.validFrom > today ? r.rule.validFrom : today} minDate={r.rule.validFrom} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {past.length ? (
            <section>
              <h2 className="mb-3 font-semibold">Histórico (encerradas)</h2>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {past.map((r) => (
                  <li key={r.rule.id} className="px-4 py-2 text-sm">
                    <span className="font-medium">{value(r)}</span> <span className="text-muted">· {scope(r)} · {period(r)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <Card>
          <h2 className="mb-4 font-semibold">Nova regra</h2>
          <NewRuleForm
            professionals={pros.map((p) => ({ id: p.id, name: p.active ? p.name : `${p.name} (inativo)` }))}
            services={svcs.map((s) => ({ id: s.id, name: s.active ? s.name : `${s.name} (inativo)` }))}
            today={today}
          />
        </Card>
      </div>
    </>
  );
}
