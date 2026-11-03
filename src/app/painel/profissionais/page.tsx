import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { segmentConfig } from "@/config/segments";
import { WEEKDAY_SHORT } from "@/domain/time";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireActor } from "@/server/session";
import { listProfessionals, loadSchedules } from "@/server/services/staff";
import { CreateProfessionalForm } from "./forms";

export const metadata: Metadata = { title: "Profissionais" };

export default async function ProfessionalsPage() {
  const { actor, company } = await requireActor("staff.manage");
  const db = getDb();
  const pros = await listProfessionals(db, actor, { includeInactive: true });
  const schedules = await loadSchedules(db, actor.companyId, pros.map((p) => p.id));
  const labels = segmentConfig(company.segment);

  return (
    <>
      <PageHeader title={labels.professional.plural} description="Jornada, pausas, serviços e acesso de cada profissional." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          {pros.length === 0 ? (
            <EmptyState title="Nenhum profissional cadastrado" />
          ) : (
            <ul className="space-y-2">
              {pros.map((p) => {
                const days = [...new Set(schedules.find((s) => s.id === p.id)?.hours.map((h) => h.weekday) ?? [])].sort();
                return (
                  <li key={p.id}>
                    <Link
                      href={`/painel/profissionais/${p.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-line-strong"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-medium">
                          {p.name}
                          {!p.active ? <Badge tone="warn">Inativo</Badge> : null}
                          {p.accessEmail ? <Badge tone="accent">Com acesso</Badge> : null}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {days.length ? `Atende: ${days.map((d) => WEEKDAY_SHORT[d]).join(", ")}` : "Sem jornada definida"} · {p.serviceIds.length} serviço(s)
                        </span>
                      </span>
                      <span aria-hidden className="text-muted">
                        →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Card>
          <h2 className="mb-4 font-semibold">Novo {labels.professional.singular.toLowerCase()}</h2>
          <CreateProfessionalForm label={labels.professional.singular} />
        </Card>
      </div>
    </>
  );
}
