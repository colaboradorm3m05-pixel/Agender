"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createInviteAction,
  createProfessionalAction,
  revokeAccessAction,
  saveProfessionalServicesAction,
  saveScheduleAction,
  updateProfessionalAction,
} from "@/app/actions/panel";
import { ActionForm, CheckboxField, SubmitButton, TextField } from "@/components/form";
import { WeeklyHoursEditor } from "@/components/weekly-hours-editor";
import { CopyButton } from "@/components/copy-button";
import { Alert, Button } from "@/components/ui";
import type { WeeklyRange } from "@/domain/availability";

export function CreateProfessionalForm({ label }: { label: string }) {
  const router = useRouter();
  return (
    <ActionForm action={createProfessionalAction} onSuccess={(d) => router.push(`/painel/profissionais/${d.id}`)}>
      <TextField label={`Nome do ${label.toLowerCase()}`} name="name" required maxLength={80} />
      <TextField label="Foto (URL https, opcional)" name="photoUrl" type="url" placeholder="https://…" />
      <SubmitButton>Cadastrar</SubmitButton>
    </ActionForm>
  );
}

export function ProfileForm({ id, name, photoUrl, active }: { id: string; name: string; photoUrl: string | null; active: boolean }) {
  return (
    <ActionForm action={updateProfessionalAction}>
      <input type="hidden" name="id" value={id} />
      <TextField label="Nome" name="name" defaultValue={name} required maxLength={80} />
      <TextField label="Foto (URL https, opcional)" name="photoUrl" type="url" defaultValue={photoUrl ?? ""} />
      <CheckboxField
        name="active"
        label="Ativo"
        defaultChecked={active}
        hint="Inativos não recebem novos agendamentos; o histórico é mantido."
      />
      <SubmitButton>Salvar</SubmitButton>
    </ActionForm>
  );
}

export function ServicesForm({ id, services, selected }: { id: string; services: { id: string; name: string; active: boolean }[]; selected: string[] }) {
  return (
    <ActionForm action={saveProfessionalServicesAction}>
      <input type="hidden" name="id" value={id} />
      {services.length === 0 ? <p className="text-sm text-muted">Nenhum serviço cadastrado.</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {services.map((s) => (
          <CheckboxField key={s.id} name="serviceIds" value={s.id} label={s.active ? s.name : `${s.name} (inativo)`} defaultChecked={selected.includes(s.id)} />
        ))}
      </div>
      <SubmitButton>Salvar serviços</SubmitButton>
    </ActionForm>
  );
}

export function ScheduleForm({ id, hours, breaks }: { id: string; hours: WeeklyRange[]; breaks: WeeklyRange[] }) {
  return (
    <ActionForm action={saveScheduleAction}>
      <input type="hidden" name="id" value={id} />
      <div>
        <h3 className="mb-2 text-sm font-semibold">Jornada de trabalho</h3>
        <WeeklyHoursEditor name="hours" initial={hours} emptyLabel="Folga" />
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Pausas recorrentes</h3>
        <p className="mb-2 text-xs text-muted">Ex.: almoço. Para folgas em datas específicas use “Bloquear horário” na agenda.</p>
        <WeeklyHoursEditor name="breaks" initial={breaks} emptyLabel="Sem pausa" addLabel="Adicionar pausa" defaultRange={{ start: "12:00", end: "13:00" }} />
      </div>
      <SubmitButton>Salvar jornada</SubmitButton>
    </ActionForm>
  );
}

export function AccessPanel({ id, accessEmail }: { id: string; accessEmail: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (accessEmail) {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Acesso ativo: <strong>{accessEmail}</strong>. Este profissional vê apenas a própria agenda e pode marcar atendimentos como concluídos ou faltas.
        </p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (!confirm("Remover o acesso deste profissional? O cadastro e o histórico continuam.")) return;
            start(async () => {
              const res = await revokeAccessAction(id);
              if (!res.ok) setError(res.error);
              router.refresh();
            });
          }}
        >
          Remover acesso
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Gere um link de convite para que o profissional crie a própria senha e consulte a agenda. O link vale por 7 dias e só pode ser usado uma vez.
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {invite ? (
        <div className="space-y-2">
          <code className="block truncate rounded-lg border border-line bg-canvas px-3 py-2 text-xs">{invite.url}</code>
          <CopyButton value={invite.url} label="Copiar convite" />
          <p className="text-xs text-muted">Envie este link apenas para o profissional. Ele não será exibido novamente.</p>
        </div>
      ) : (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await createInviteAction(id);
              if (res.ok) setInvite(res.data);
              else setError(res.error);
            })
          }
        >
          {pending ? "Gerando…" : "Gerar link de convite"}
        </Button>
      )}
    </div>
  );
}
