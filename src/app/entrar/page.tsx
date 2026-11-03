import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { safeNext } from "@/lib/safe-redirect";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignInPage(props: PageProps<"/entrar">) {
  const sp = await props.searchParams;
  const next = safeNext(sp.next);
  if (await getSession()) redirect(next);
  return (
    <AuthShell
      title="Entrar"
      subtitle="Acesse a agenda do seu estabelecimento."
      footer={
        <>
          Ainda não tem conta?{" "}
          <Link className="font-medium text-accent underline-offset-2 hover:underline" href={`/criar-conta?next=${encodeURIComponent(next)}`}>
            Criar conta
          </Link>
        </>
      }
    >
      <AuthForm mode="sign-in" next={next} />
    </AuthShell>
  );
}
