"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelAppointmentAction, recordPaymentAction, rescheduleAction, setStatusAction } from "@/app/actions/panel";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/form";
import { Alert, Button } from "@/components/ui";
import { SlotPicker } from "@/app/painel/agenda/slot-picker";

export function StatusButtons({
  id,
  status,
  started,
  canManage,
}: {
  id: string;
  status: string;
  started: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (next: "confirmed" | "completed" | "no_show") =>
    start(async () => {
      const res = await setStatusAction(id, next);
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        router.refresh();
      }
    });

  return (
    <div className="space-y-2">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {status === "confirmed" ? (
          <>
            <Button disabled={pending || !started} onClick={() => run("completed")}>
              Marcar como concluído
            </Button>
            <Button variant="secondary" disabled={pending || !started} onClick={() => run("no_show")}>
              Registrar falta
            </Button>
          </>
        ) : null}
        {(status === "completed" || status === "no_show") && canManage ? (
          <Button variant="secondary" disabled={pending} onClick={() => run("confirmed")}>
            Desfazer (voltar para confirmado)
          </Button>
        ) : null}
      </div>
      {status === "confirmed" && !started ? (
        <p className="text-xs text-muted">Concluir ou registrar falta fica disponível a partir do horário de início.</p>
      ) : null}
    </div>
  );
}

export function RescheduleForm({
  id,
  professionals,
  currentProfessionalId,
  serviceId,
  defaultDate,
}: {
  id: string;
  professionals: { id: string; name: string }[];
  currentProfessionalId: string;
  serviceId: string;
  defaultDate: string;
}) {
  const [date, setDate] = useState(defaultDate);
  const [proId, setProId] = useState(currentProfessionalId);
  return (
    <ActionForm action={rescheduleAction}>
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Nova data" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <SelectField label="Profissional" name="professionalId" value={proId} onChange={(e) => setProId(e.target.value)}>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
      </div>
      <SlotPicker key={`${proId}-${date}`} professionalId={proId} serviceId={serviceId} date={date} excludeAppointmentId={id} />
      <SubmitButton pendingText="Reagendando…">Reagendar</SubmitButton>
    </ActionForm>
  );
}

export function CancelForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button variant="danger" onClick={() => setOpen(true)}>
        Cancelar atendimento
      </Button>
    );
  return (
    <ActionForm action={cancelAppointmentAction}>
      <input type="hidden" name="id" value={id} />
      <TextField label="Motivo (opcional)" name="reason" maxLength={300} />
      <div className="flex gap-2">
        <SubmitButton variant="danger" pendingText="Cancelando…">
          Confirmar cancelamento
        </SubmitButton>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Voltar
        </Button>
      </div>
    </ActionForm>
  );
}

export function PaymentForm({
  appointmentId,
  defaultAmount,
  defaultDate,
  defaultTime,
  methods,
}: {
  appointmentId?: string;
  defaultAmount: string;
  defaultDate: string;
  defaultTime: string;
  methods: { value: string; label: string }[];
}) {
  return (
    <ActionForm action={recordPaymentAction} resetOnSuccess>
      {appointmentId ? <input type="hidden" name="appointmentId" value={appointmentId} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Valor recebido (R$)" name="amountCents" inputMode="decimal" defaultValue={defaultAmount} required />
        <SelectField label="Forma de pagamento" name="method" defaultValue="pix">
          {methods.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </SelectField>
        <TextField label="Data" name="date" type="date" defaultValue={defaultDate} required />
        <TextField label="Hora" name="time" type="time" defaultValue={defaultTime} required />
      </div>
      <TextField label="Observação (opcional)" name="notes" maxLength={300} />
      <p className="text-xs text-muted">Este registro é apenas controle interno: nenhuma cobrança é feita pelo sistema.</p>
      <SubmitButton pendingText="Registrando…">Registrar pagamento</SubmitButton>
    </ActionForm>
  );
}
