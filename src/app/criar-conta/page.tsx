import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { safeNext } from "@/lib/safe-redirect";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage(props: PageProps<"/criar-conta">) {
  const sp = await props.searchParams;
  const next = safeNext(sp.next, "/onboarding");
  if (await getSession()) redirect(next);
  return (
    <AuthShell
      title="Criar conta"
      subtitle="Em poucos minutos sua agenda online estará no ar."
      footer={
        <>
          Já tem conta?{" "}
          <Link className="font-medium text-accent underline-offset-2 hover:underline" href={`/entrar?next=${encodeURIComponent(next)}`}>
            Entrar
          </Link>
        </>
      }
    >
      <AuthForm mode="sign-up" next={next} />
    </AuthShell>
  );
}
