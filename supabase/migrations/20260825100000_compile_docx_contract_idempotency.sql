-- Retry-safe DOCX contract generation. Null keys preserve all legacy callers.
ALTER TABLE public.org_contracts
  ADD COLUMN IF NOT EXISTS submission_key uuid,
  ADD COLUMN IF NOT EXISTS submission_snapshot_sha256 text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_contracts_submission_key
  ON public.org_contracts (organization_id, submission_key)
  WHERE submission_key IS NOT NULL;

COMMENT ON COLUMN public.org_contracts.submission_key IS
  'Client-generated UUID reused when retrying the same contract compilation submission.';
COMMENT ON COLUMN public.org_contracts.submission_snapshot_sha256 IS
  'SHA-256 of the canonical server-side compilation snapshot; a reused key with different data is rejected.';

ALTER TABLE public.org_contracts
  DROP CONSTRAINT IF EXISTS org_contracts_submission_snapshot_sha256_check;
ALTER TABLE public.org_contracts
  ADD CONSTRAINT org_contracts_submission_snapshot_sha256_check
  CHECK (
    submission_snapshot_sha256 IS NULL
    OR submission_snapshot_sha256 ~ '^[0-9a-f]{64}$'
  );
