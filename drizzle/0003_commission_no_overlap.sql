-- Uma única regra vigente por escopo (empresa + profissional + serviço) em
-- cada data. Nulos ("todos") são tratados como um valor próprio do escopo.
ALTER TABLE "commission_rules"
  ADD CONSTRAINT "commission_rules_no_overlap"
  EXCLUDE USING gist (
    "company_id" WITH =,
    (coalesce("professional_id", '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    (coalesce("service_id", '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    daterange("valid_from", "valid_to", '[]') WITH &&
  );
