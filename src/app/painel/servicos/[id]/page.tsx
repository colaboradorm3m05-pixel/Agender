import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { segmentConfig } from "@/config/segments";
import { Card, PageHeader } from "@/components/ui";
import { requireActor } from "@/server/session";
import { listServices } from "@/server/services/catalog";
import { listProfessionals } from "@/server/services/staff";
import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Editar serviço" };

export default async function EditServicePage(props: PageProps<"/painel/servicos/[id]">) {
  const { actor, company } = await requireActor("services.manage");
  const { id } = await props.params;
  const db = getDb();
  const [svcs, pros] = await Promise.all([listServices(db, actor, { includeInactive: true }), listProfessionals(db, actor, { includeInactive: true })]);
  const svc = svcs.find((s) => s.id === id);
  if (!svc) notFound();
  return (
    <>
      <Link href="/painel/servicos" className="text-sm text-accent hover:underline">
        ← Serviços
      </Link>
      <PageHeader title={svc.name} />
      <Card className="max-w-2xl">
        <ServiceForm
          initial={svc}
          professionals={pros.map((p) => ({ id: p.id, name: p.active ? p.name : `${p.name} (inativo)` }))}
          professionalLabel={segmentConfig(company.segment).professional.plural}
        />
      </Card>
    </>
  );
}
