-- Reverte 0000_init: APAGA TODAS AS TABELAS E DADOS. Use só em banco novo
-- ou depois de restaurar/confirmar backup.
DROP TABLE IF EXISTS
  "audit_logs", "payments", "appointments", "customers", "professional_services",
  "services", "time_blocks", "recurring_breaks", "working_hours", "professional_invites",
  "memberships", "professionals", "company_hours", "companies", "rate_limits",
  "rate_limit", "verification", "account", "session", "user"
CASCADE;
