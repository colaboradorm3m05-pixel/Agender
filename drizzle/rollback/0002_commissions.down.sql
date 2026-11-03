-- Reverte 0002_commissions. Apaga as regras e as fotografias de comissão dos atendimentos.
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "commission_description";
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "commission_cents";
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "commission_rule_id";
DROP TABLE IF EXISTS "commission_rules";
