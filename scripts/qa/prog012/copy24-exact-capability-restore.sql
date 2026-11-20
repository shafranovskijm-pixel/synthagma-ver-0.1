BEGIN;
DO $g$BEGIN IF current_database()<>'sintagma_copy24_lab_20261028'OR current_user<>'postgres'OR session_user<>'postgres'OR inet_server_addr()IS DISTINCT FROM'127.0.0.1'::inet OR inet_server_port()<>5432 OR current_setting('data_directory')<>'/var/lib/postgresql/data'OR current_setting('server_version_num')<>'170011'OR current_setting('pcr.lab_authorized',true)IS DISTINCT FROM'source-reviewed-root-run-only'THEN RAISE EXCEPTION 'COPY24_CAP_FIXTURE_PRIVATE_LAB_ONLY';END IF;END;$g$;
CREATE OR REPLACE FUNCTION public.pcf_v1_delivery_capabilities() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN RETURN jsonb_build_object('protocol','pcf-bytea/1','admin_bytes_reader_source',true,
 'own_learner_bytes_reader_source',true,'frontend_consumers_accepted',false,
 'copied_centre_exact_binding_supported',false,'frozen_reader_implemented',false);END;$f$;

COMMIT;
