-- Garante no banco que um profissional não tenha dois atendimentos ativos
-- sobrepostos (inclui o intervalo adicional após o serviço). Só agendamentos
-- cancelados liberam o horário. Funciona mesmo com requisições simultâneas.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "professional_id" WITH =,
    tstzrange("starts_at", "occupied_until", '[)') WITH &&
  ) WHERE ("status" <> 'cancelled');
