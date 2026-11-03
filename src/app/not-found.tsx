import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Página não encontrada</h1>
      <p className="mt-2 text-sm text-muted">Confira o endereço. Se recebeu este link de um estabelecimento, peça o link correto.</p>
      <Link href="/" className={buttonClass("secondary", "md", "mt-6")}>
        Ir para o início
      </Link>
    </main>
  );
}
