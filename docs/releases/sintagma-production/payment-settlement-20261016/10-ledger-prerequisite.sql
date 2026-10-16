-- T-Bank callbacks used to write the ledger, recalculate SUM(amount), and
-- overwrite organizations.balance in three independent PostgREST
-- transactions. A concurrent marketplace debit could therefore be omitted
-- from the SUM and then overwritten after its organization row lock released.
-- Keep an explicit callback identity and apply each credit exactly once in one
-- database transaction.

ALTER TABLE public.balance_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS balance_transactions_idempotency_key_unique
  ON public.balance_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.balance_transactions.idempotency_key IS
  'Stable external event identity. T-Bank uses tbank:subscription:<invoice-id> or tbank:course:<payment-id>.';

CREATE OR REPLACE FUNCTION public.apply_tbank_balance_credit(
  p_organization_id uuid,
  p_amount numeric,
  p_transaction_type text,
  p_description text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_balance numeric;
  v_transaction_id uuid;
  v_existing public.balance_transactions%ROWTYPE;
BEGIN
  -- The RPC is an Edge/service integration boundary, not a browser billing
  -- endpoint. A trusted direct database session remains available for repair.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin')
  THEN
    RAISE EXCEPTION 'Only the trusted payment webhook may apply a balance credit'
      USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL
     OR p_amount <= 0
     OR p_amount = 'NaN'::numeric
  THEN
    RAISE EXCEPTION 'Balance credit amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  IF p_transaction_type NOT IN ('subscription', 'payment') THEN
    RAISE EXCEPTION 'Unsupported T-Bank balance transaction type'
      USING ERRCODE = '22023';
  END IF;

  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22023';
  END IF;

  -- Match purchase_marketplace_course lock order: organization row first.
  -- This serializes every balance mutation and prevents a stale overwrite.
  SELECT o.balance
    INTO v_balance
  FROM public.organizations o
  WHERE o.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.balance_transactions (
    organization_id,
    amount,
    type,
    description,
    related_order_id,
    performed_by,
    idempotency_key
  )
  VALUES (
    p_organization_id,
    p_amount,
    p_transaction_type,
    p_description,
    NULL,
    NULL,
    v_key
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_transaction_id;

  IF v_transaction_id IS NULL THEN
    SELECT tx.*
      INTO v_existing
    FROM public.balance_transactions tx
    WHERE tx.idempotency_key = v_key;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Idempotent balance transaction could not be resolved'
        USING ERRCODE = 'P0002';
    END IF;

    -- A key may only ever describe one exact financial event. Fail closed if
    -- a malformed replay tries to reuse it for another organization or amount.
    IF v_existing.organization_id IS DISTINCT FROM p_organization_id
       OR v_existing.amount IS DISTINCT FROM p_amount
       OR v_existing.type IS DISTINCT FROM p_transaction_type
    THEN
      RAISE EXCEPTION 'Idempotency key conflicts with another balance transaction'
        USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'transaction_id', v_existing.id,
      'balance', v_balance,
      'applied', false
    );
  END IF;

  UPDATE public.organizations
  SET balance = balance + p_amount
  WHERE id = p_organization_id
  RETURNING balance INTO v_balance;

  RETURN jsonb_build_object(
    'transaction_id', v_transaction_id,
    'balance', v_balance,
    'applied', true
  );
END
$function$;

REVOKE ALL ON FUNCTION public.apply_tbank_balance_credit(uuid, numeric, text, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_tbank_balance_credit(uuid, numeric, text, text, text)
  FROM anon;
REVOKE ALL ON FUNCTION public.apply_tbank_balance_credit(uuid, numeric, text, text, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tbank_balance_credit(uuid, numeric, text, text, text)
  TO service_role;
