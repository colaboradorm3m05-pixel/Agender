-- Reverte 0001_no_overlap. ATENÇÃO: sem a constraint, a garantia contra
-- sobreposição passa a depender só da trava na aplicação.
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_no_overlap";
-- A extensão btree_gist é mantida (pode ser usada por outros objetos).
