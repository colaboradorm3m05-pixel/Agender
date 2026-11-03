"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deletePaymentAction, recordPaymentAction } from "@/app/actions/panel";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/form";

export function StandalonePaymentForm({
  appointments,
  defaultDate,
  defaultTime,
  methods,
}: {
  appointments: { id: string; label: string }[];
  defaultDate: string;
  defaultTime: string;
  methods: { value: string; label: string }[];
}) {
  return (
    <ActionForm action={recordPaymentAction} resetOnSuccess>
      <SelectField label="Agendamento (opcional)" name="appointmentId" defaultValue="" hint="Atendimentos dos últimos 14 dias ainda não quitados.">
        <option value="">Sem vínculo</option>
        {appointments.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </SelectField>
      <TextField label="Valor (R$)" name="amountCents" inputMode="decimal" placeholder="40,00" required />
      <SelectField label="Forma de pagamento" name="method" defaultValue="pix">
        {methods.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Data" name="date" type="date" defaultValue={defaultDate} required />
        <TextField label="Hora" name="time" type="time" defaultValue={defaultTime} required />
      </div>
      <TextField label="Observação (opcional)" name="notes" maxLength={300} />
      <SubmitButton pendingText="Registrando…">Registrar</SubmitButton>
    </ActionForm>
  );
}

export function DeletePaymentButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs font-medium text-danger hover:underline"
      onClick={() => {
        if (!confirm("Excluir este registro de pagamento?")) return;
        start(async () => {
          const res = await deletePaymentAction(id);
          if (!res.ok) alert(res.error);
          router.refresh();
        });
      }}
    >
      {pending ? "Excluindo…" : "Excluir"}
    </button>
  );
}
