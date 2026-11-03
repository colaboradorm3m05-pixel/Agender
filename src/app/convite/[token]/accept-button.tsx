"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInviteAction } from "@/app/actions/company";
import { Alert, buttonClass } from "@/components/ui";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <button
        type="button"
        disabled={pending}
        className={buttonClass("primary", "md", "w-full")}
        onClick={() =>
          start(async () => {
            const res = await acceptInviteAction(token);
            if (res.ok) router.push("/painel/agenda");
            else setError(res.error);
          })
        }
      >
        {pending ? "Aceitando…" : "Aceitar convite"}
      </button>
    </div>
  );
}
