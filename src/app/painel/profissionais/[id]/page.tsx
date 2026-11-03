import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { Card, PageHeader } from "@/components/ui";
import { AppError } from "@/server/errors";
import { requireActor } from "@/server/session";
import { listServices } from "@/server/services/catalog";
import { getSchedule, listProfessionals } from "@/server/services/staff";
import { AccessPanel, ProfileForm, ScheduleForm, ServicesForm } from "../forms";

export const metadata: Metadata = { title: "Profissional" };

export default async function ProfessionalPage(props: PageProps<"/painel/profissionais/[id]">) {
  const { actor } = await requireActor("staff.manage");
  const { id } = await props.params;
  const db = getDb();
  const pros = await listProfessionals(db, actor, { includeInactive: true });
  const pro = pros.find((p) => p.id === id);
  if (!pro) notFound();
  const [svcs, schedule] = await Promise.all([
    listServices(db, actor, { includeInactive: true }),
    getSchedule(db, actor, id).catch((e) => {
      if (e instanceof AppError) notFound();
      throw e;
    }),
  ]);

  return (
    <>
      <Link href="/painel/profissionais" className="text-sm text-accent hover:underline">
        ← Profissionais
      </Link>
      <PageHeader title={pro.name} />
      <div className="grid gap-4 xl:grid-cols-[1fr_360px] [&>*]:min-w-0">
        <Card>
          <h2 className="mb-4 font-semibold">Jornada e pausas</h2>
          <ScheduleForm id={pro.id} hours={schedule.hours} breaks={schedule.breaks} />
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 font-semibold">Dados</h2>
            <ProfileForm id={pro.id} name={pro.name} photoUrl={pro.photoUrl} active={pro.active} />
          </Card>
          <Card>
            <h2 className="mb-4 font-semibold">Serviços atendidos</h2>
            <ServicesForm id={pro.id} services={svcs.map((s) => ({ id: s.id, name: s.name, active: s.active }))} selected={pro.serviceIds} />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Acesso ao sistema</h2>
            <AccessPanel id={pro.id} accessEmail={pro.accessEmail} />
          </Card>
        </div>
      </div>
    </>
  );
}
