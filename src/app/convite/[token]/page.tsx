import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { AuthShell } from "@/components/auth-shell";
import { buttonClass } from "@/components/ui";
import { getSession } from "@/server/session";
import { getInvite } from "@/server/services/staff";
import { AcceptInviteButton } from "./accept-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Convite", robots: { index: false, follow: false } };

export default async function InvitePage(props: PageProps<"/convite/[token]">) {
  const { token } = await props.params;
  const db = getDb();
  const invite = await getInvite(db, token);
  if (!invite) {
    return (
      <AuthShell title="Convite inválido" subtitle="O link expirou ou já foi usado. Peça um novo convite ao proprietário.">
        <Link href="/" className={buttonClass("secondary", "md", "w-full")}>
          Voltar ao início
        </Link>
      </AuthShell>
    );
  }
  const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, invite.invite.companyId));
  const session = await getSession();
  const next = encodeURIComponent(`/convite/${token}`);
  return (
    <AuthShell title={`Convite de ${company?.name ?? "estabelecimento"}`} subtitle={`Acesso à agenda de ${invite.professionalName}.`}>
      {session ? (
        <div className="space-y-3">
          <p className="text-sm">
            Você está conectado como <strong>{session.user.email}</strong>.
          </p>
          <AcceptInviteButton token={token} />
        </div>
      ) : (
        <div className="space-y-2">
          <Link href={`/criar-conta?next=${next}`} className={buttonClass("primary", "md", "w-full")}>
            Criar minha conta
          </Link>
          <Link href={`/entrar?next=${next}`} className={buttonClass("secondary", "md", "w-full")}>
            Já tenho conta
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
