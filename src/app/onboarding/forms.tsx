"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { SEGMENT_CONFIG, SEGMENTS } from "@/config/segments";
import { TIMEZONE_OPTIONS } from "@/config/timezones";
import type { WeeklyRange } from "@/domain/availability";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form";
import { WeeklyHoursEditor } from "@/components/weekly-hours-editor";
import { Alert, buttonClass } from "@/components/ui";
import {
  createCompanyAction,
  finishOnboardingAction,
  onboardingProfessionalAction,
  onboardingServiceAction,
  saveHoursAction,
  saveLinksAction,
  updateProfileAction,
} from "@/app/actions/company";

export function CompanyStep() {
  return (
    <ActionForm action={createCompanyAction} successRedirect="/onboarding?etapa=2">
      <TextField label="Nome do estabelecimento" name="name" placeholder="Ex.: Barbearia do Zé" autoFocus required />
      <SelectField label="Segmento" name="segment" defaultValue="barbershop" hint="Ajusta os textos exibidos. Você pode mudar depois.">
        {SEGMENTS.map((s) => (
          <option key={s} value={s}>
            {SEGMENT_CONFIG[s].label}
          </option>
        ))}
      </SelectField>
      <SubmitButton pendingText="Criando…">Continuar</SubmitButton>
    </ActionForm>
  );
}

export function LocationStep({ initial }: { initial: { phone: string; addressLine: string; city: string; serviceInfo: string } }) {
  return (
    <ActionForm action={updateProfileAction} successRedirect="/onboarding?etapa=3" showSuccess={false}>
      <input type="hidden" name="requireLocation" value="1" />
      <TextField label="Telefone / WhatsApp do estabelecimento" name="phone" defaultValue={initial.phone} inputMode="tel" placeholder="(11) 99999-0000" />
      <TextField label="Endereço" name="addressLine" defaultValue={initial.addressLine} placeholder="Rua, número, bairro" />
      <TextField label="Cidade" name="city" defaultValue={initial.city} />
      <TextAreaField
        label="Informações de atendimento"
        name="serviceInfo"
        defaultValue={initial.serviceInfo}
        hint="Ex.: atendimento em domicílio, estacionamento, como chegar. Preencha o endereço ou estas informações."
      />
      <SubmitButton>Salvar e continuar</SubmitButton>
    </ActionForm>
  );
}

export function HoursStep({ timezone, hours }: { timezone: string; hours: WeeklyRange[] }) {
  return (
    <ActionForm action={saveHoursAction} successRedirect="/onboarding?etapa=4" showSuccess={false}>
      <SelectField label="Fuso horário" name="timezone" defaultValue={timezone}>
        {TIMEZONE_OPTIONS.map((tz) => (
          <option key={tz.value} value={tz.value}>
            {tz.label}
          </option>
        ))}
      </SelectField>
      <div>
        <p className="mb-2 text-sm font-medium">Horário de funcionamento</p>
        <WeeklyHoursEditor name="hours" initial={hours} />
      </div>
      <SubmitButton>Salvar e continuar</SubmitButton>
    </ActionForm>
  );
}

export function ProfessionalStep({ label }: { label: string }) {
  return (
    <ActionForm action={onboardingProfessionalAction} resetOnSuccess>
      <TextField label={`Nome do ${label.toLowerCase()}`} name="name" placeholder="Ex.: Carlos" required />
      <p className="text-xs text-muted">A jornada começa igual ao horário de funcionamento. Pausas e folgas podem ser ajustadas depois.</p>
      <SubmitButton variant="secondary">Adicionar</SubmitButton>
    </ActionForm>
  );
}

export function ServiceStep() {
  return (
    <ActionForm action={onboardingServiceAction} resetOnSuccess>
      <TextField label="Nome do serviço" name="name" placeholder="Ex.: Corte" required />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Preço (R$)" name="priceCents" inputMode="decimal" placeholder="40,00" required />
        <TextField label="Duração (min)" name="durationMinutes" type="number" min={5} max={720} step={5} defaultValue={30} required />
        <TextField
          label="Intervalo após (min)"
          name="bufferAfterMinutes"
          type="number"
          min={0}
          max={240}
          step={5}
          defaultValue={0}
          hint="Tempo para limpeza/preparo."
        />
      </div>
      <SubmitButton variant="secondary">Adicionar serviço</SubmitButton>
    </ActionForm>
  );
}

export function LinksStep({
  professionals,
  services,
}: {
  professionals: { id: string; name: string; serviceIds: string[] }[];
  services: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={saveLinksAction} successRedirect="/onboarding?etapa=7" showSuccess={false}>
      <div className="space-y-4">
        {professionals.map((p) => (
          <fieldset key={p.id} className="rounded-lg border border-line p-4">
            <legend className="px-1 text-sm font-semibold">{p.name}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {services.map((s) => (
                <CheckboxField
                  key={s.id}
                  name={`link:${p.id}`}
                  value={s.id}
                  label={s.name}
                  defaultChecked={p.serviceIds.includes(s.id) || p.serviceIds.length === 0}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <SubmitButton>Salvar e continuar</SubmitButton>
    </ActionForm>
  );
}

export function FinishButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <button
        type="button"
        disabled={pending}
        className={buttonClass("primary")}
        onClick={() =>
          start(async () => {
            const res = await finishOnboardingAction();
            if (res.ok) router.push("/painel");
            else setError(res.error);
          })
        }
      >
        {pending ? "Finalizando…" : "Ir para o painel"}
      </button>
    </div>
  );
}
