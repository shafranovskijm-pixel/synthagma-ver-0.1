DO $$
DECLARE
  v_id uuid := '41f94aea-899e-4aca-a911-17fe19c9bf05';
  v_status text;
  v_total int;
  v_pending int;
  v_maxa int;
  v_uniq int;
BEGIN
  SELECT status INTO v_status FROM public.email_campaigns WHERE id = v_id;
  SELECT count(*), count(*) FILTER (WHERE status='pending'), max(attempt_count),
         count(DISTINCT (recipient_id::text||'|'||step_no::text))
    INTO v_total, v_pending, v_maxa, v_uniq
  FROM public.mailing_send_jobs WHERE campaign_id = v_id;

  IF v_status = 'draft' AND v_total = 812 AND v_pending = 812 AND v_maxa = 0 AND v_uniq = 812 THEN
    UPDATE public.email_campaigns
      SET status = 'scheduled', paused_reason = NULL
    WHERE id = v_id AND status = 'draft';
    RAISE NOTICE 'resumed';
  ELSE
    RAISE EXCEPTION 'preconditions_not_met status=% total=% pending=% maxa=% uniq=%', v_status, v_total, v_pending, v_maxa, v_uniq;
  END IF;
END $$;