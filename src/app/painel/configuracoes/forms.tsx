"use client";

import { saveHoursAction, updatePolicyAction, updateProfileAction } from "@/app/actions/company";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form";
import { WeeklyHoursEditor } from "@/components/weekly-hours-editor";
import { SEGMENT_CONFIG, SEGMENTS } from "@/config/segments";
import { TIMEZONE_OPTIONS } from "@/config/timezones";
import type { WeeklyRange } from "@/domain/availability";

type Company = {
  name: string;
  slug: string;
  segment: string;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  serviceInfo: string | null;
  brandColor: string;
  timezone: string;
  minAdvanceMinutes: number;
  maxDaysAhead: number;
  slotStepMinutes: number;
  allowClientCancel: boolean;
  allowClientReschedule: boolean;
  clientChangeMinAdvanceMinutes: number;
};

export function ProfileSettings({ company, baseUrl }: { company: Company; baseUrl: string }) {
  return (
    <ActionForm action={updateProfileAction}>
      <TextField label="Nome do estabelecimento" name="name" defaultValue={company.name} required />
      <SelectField label="Segmento" name="segment" defaultValue={company.segment}>
        {SEGMENTS.map((s) => (
          <option key={s} value={s}>
            {SEGMENT_CONFIG[s].label}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Endereço do link público"
        name="slug"
        defaultValue={company.slug}
        hint={`${baseUrl}/b/${company.slug} — ao mudar, o link antigo deixa de funcionar.`}
        pattern="[a-z0-9-]+"
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Telefone / WhatsApp" name="phone" defaultValue={company.phone ?? ""} />
        <TextField label="Cidade" name="city" defaultValue={company.city ?? ""} />
      </div>
      <TextField label="Endereço" name="addressLine" defaultValue={company.addressLine ?? ""} />
      <TextAreaField label="Informações de atendimento" name="serviceInfo" defaultValue={company.serviceInfo ?? ""} maxLength={500} />
      <TextField label="Cor da marca" name="brandColor" type="color" defaultValue={company.brandColor} className="w-32" hint="Usada na página de agendamento." />
      <SubmitButton>Salvar dados</SubmitButton>
    </ActionForm>
  );
}

export function HoursSettings({ timezone, hours }: { timezone: string; hours: WeeklyRange[] }) {
  return (
    <ActionForm action={saveHoursAction}>
      <SelectField label="Fuso horário" name="timezone" defaultValue={timezone}>
        {!TIMEZONE_OPTIONS.some((t) => t.value === timezone) ? <option value={timezone}>{timezone}</option> : null}
        {TIMEZONE_OPTIONS.map((tz) => (
          <option key={tz.value} value={tz.value}>
            {tz.label}
          </option>
        ))}
      </SelectField>
      <WeeklyHoursEditor name="hours" initial={hours} />
      <p className="text-xs text-muted">Atendimentos já marcados não são alterados. Novos horários respeitam o funcionamento e a jornada de cada profissional.</p>
      <SubmitButton>Salvar horário</SubmitButton>
    </ActionForm>
  );
}

export function PolicySettings({ company }: { company: Company }) {
  return (
    <ActionForm action={updatePolicyAction}>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Antecedência mínima (min)"
          name="minAdvanceMinutes"
          type="number"
          min={0}
          step={15}
          defaultValue={company.minAdvanceMinutes}
          hint="Para agendar pelo link."
        />
        <TextField label="Agendar até (dias à frente)" name="maxDaysAhead" type="number" min={1} max={365} defaultValue={company.maxDaysAhead} />
        <SelectField label="Intervalo entre horários" name="slotStepMinutes" defaultValue={String(company.slotStepMinutes)}>
          {[5, 10, 15, 20, 30, 45, 60].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </SelectField>
      </div>
      <CheckboxField name="allowClientCancel" label="Cliente pode cancelar pelo link da reserva" defaultChecked={company.allowClientCancel} />
      <CheckboxField name="allowClientReschedule" label="Cliente pode reagendar pelo link da reserva" defaultChecked={company.allowClientReschedule} />
      <TextField
        label="Prazo para o cliente alterar (horas antes)"
        name="clientChangeMinAdvanceHours"
        type="number"
        min={0}
        max={336}
        defaultValue={Math.round(company.clientChangeMinAdvanceMinutes / 60)}
        className="sm:w-64"
      />
      <SubmitButton>Salvar regras</SubmitButton>
    </ActionForm>
  );
}
