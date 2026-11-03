"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteBlockAction } from "@/app/actions/panel";

export function DeleteBlockButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="shrink-0 rounded px-1 text-[11px] font-medium text-danger hover:bg-danger-soft"
      onClick={() => {
        if (!confirm("Remover este bloqueio?")) return;
        start(async () => {
          const res = await deleteBlockAction(id);
          if (!res.ok) alert(res.error);
          router.refresh();
        });
      }}
    >
      {pending ? "…" : "Remover"}
    </button>
  );
}
