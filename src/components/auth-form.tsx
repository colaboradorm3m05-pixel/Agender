"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Alert, buttonClass, inputClass } from "./ui";

/** Mapeia códigos do Better Auth para mensagens em português. */
function translate(code?: string, fallback?: string) {
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-mail ou senha incorretos.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "Já existe uma conta com este e-mail. Tente entrar.";
    case "PASSWORD_TOO_SHORT":
      return "A senha precisa ter pelo menos 8 caracteres.";
    case "INVALID_EMAIL":
      return "E-mail inválido.";
    default:
      return fallback && /too many/i.test(fallback)
        ? "Muitas tentativas. Aguarde um minuto e tente novamente."
        : "Não foi possível concluir. Verifique os dados e tente novamente.";
  }
}

export function AuthForm({ mode, next }: { mode: "sign-in" | "sign-up"; next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ids = { name: useId(), email: useId(), password: useId() };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const name = String(fd.get("name") ?? "").trim();
    if (mode === "sign-up" && !name) return setError("Informe seu nome.");
    if (!email || !password) return setError("Informe e-mail e senha.");
    if (mode === "sign-up" && password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    setPending(true);
    const res =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (res.error) return setError(translate(res.error.code, res.error.message));
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {mode === "sign-up" ? (
        <div>
          <label htmlFor={ids.name} className="mb-1 block text-sm font-medium">
            Seu nome
          </label>
          <input id={ids.name} name="name" autoComplete="name" required className={inputClass} />
        </div>
      ) : null}
      <div>
        <label htmlFor={ids.email} className="mb-1 block text-sm font-medium">
          E-mail
        </label>
        <input id={ids.email} name="email" type="email" autoComplete="email" required className={inputClass} />
      </div>
      <div>
        <label htmlFor={ids.password} className="mb-1 block text-sm font-medium">
          Senha
        </label>
        <input
          id={ids.password}
          name="password"
          type="password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          minLength={8}
          required
          aria-describedby={mode === "sign-up" ? `${ids.password}-hint` : undefined}
          className={inputClass}
        />
        {mode === "sign-up" ? (
          <p id={`${ids.password}-hint`} className="mt-1 text-xs text-muted">
            Mínimo de 8 caracteres.
          </p>
        ) : null}
      </div>
      <button type="submit" disabled={pending} className={buttonClass("primary", "md", "w-full")}>
        {pending ? "Aguarde…" : mode === "sign-up" ? "Criar conta" : "Entrar"}
      </button>
    </form>
  );
}

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className ?? "text-sm text-muted underline-offset-2 hover:text-ink hover:underline"}
      onClick={async () => {
        await authClient.signOut();
        router.push("/entrar");
        router.refresh();
      }}
    >
      Sair
    </button>
  );
}
