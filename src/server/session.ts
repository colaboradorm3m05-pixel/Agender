import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { companies, memberships } from "@/db/schema";
import { auth } from "@/lib/auth";
import { can, type Actor, type Permission, type Role } from "./permissions";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/entrar");
  return session.user;
}

/**
 * Monta o Actor a partir da sessão e do vínculo no banco. A empresa ativa vem
 * SEMPRE do vínculo do usuário, nunca de parâmetro enviado pelo navegador.
 */
export const getActorContext = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const [row] = await getDb()
    .select({ membership: memberships, company: companies })
    .from(memberships)
    .innerJoin(companies, eq(companies.id, memberships.companyId))
    .where(eq(memberships.userId, session.user.id))
    .limit(1);
  if (!row) return { user: session.user, actor: null, company: null };
  const actor: Actor = {
    userId: session.user.id,
    companyId: row.company.id,
    role: row.membership.role as Role,
    professionalId: row.membership.professionalId,
  };
  return { user: session.user, actor, company: row.company };
});

/** Para páginas do painel: exige login e empresa; redireciona caso contrário. */
export async function requireActor(permission?: Permission) {
  const ctx = await getActorContext();
  if (!ctx) redirect("/entrar");
  if (!ctx.actor || !ctx.company) redirect("/onboarding");
  if (permission && !can(ctx.actor, permission)) redirect("/painel/agenda");
  return { user: ctx.user, actor: ctx.actor, company: ctx.company };
}

/** Para server actions: mesmo controle, mas sem redirecionar (retorna null). */
export async function actorForAction(): Promise<Actor | null> {
  const ctx = await getActorContext();
  return ctx?.actor ?? null;
}
