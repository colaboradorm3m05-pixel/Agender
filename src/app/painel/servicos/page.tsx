import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { segmentConfig } from "@/config/segments";
import { formatCents } from "@/domain/money";
import { formatDuration } from "@/domain/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireActor } from "@/server/session";
import { listServices } from "@/server/services/catalog";
import { listProfessionals } from "@/server/services/staff";
import { ServiceForm } from "./service-form";

export const metadata: Metadata = { title: "Serviços" };

export default async function ServicesPage() {
  const { actor, company } = await requireActor("services.manage");
  const db = getDb();
  const [svcs, pros] = await Promise.all([listServices(db, actor, { includeInactive: true }), listProfessionals(db, actor)]);
  const labels = segmentConfig(company.segment);
  const proName = new Map(pros.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader title="Serviços" description="Preço, duração e quem realiza cada serviço." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          {svcs.length === 0 ? (
            <EmptyState title="Nenhum serviço cadastrado" description="Cadastre o primeiro serviço ao lado." />
          ) : (
            <ul className="space-y-2">
              {svcs.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/painel/servicos/${s.id}`}
                    className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-3 hover:border-line-strong sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span>
                      <span className="flex items-center gap-2 font-medium">
                        {s.name} {!s.active ? <Badge tone="warn">Inativo</Badge> : null}
                      </span>
                      <span className="block text-xs text-muted">
                        {formatDuration(s.durationMinutes)}
                        {s.bufferAfterMinutes ? ` + ${s.bufferAfterMinutes} min de intervalo` : ""} ·{" "}
                        {s.professionalIds.length
                          ? s.professionalIds.map((id) => proName.get(id)).filter(Boolean).join(", ")
                          : "nenhum profissional vinculado"}
                      </span>
                    </span>
                    <span className="tabular font-semibold">{formatCents(s.priceCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Card>
          <h2 className="mb-4 font-semibold">Novo serviço</h2>
          <ServiceForm professionals={pros.map((p) => ({ id: p.id, name: p.name }))} professionalLabel={labels.professional.plural} />
        </Card>
      </div>
    </>
  );
}
