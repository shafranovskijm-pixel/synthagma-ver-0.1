-- Remove retired platform sender accounts only when no dependent history
-- exists. The DO block is atomic: any dependency aborts the entire migration
-- before the account DELETE is reached.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.email_warmup_pings AS p
    JOIN public.email_sender_pool AS s
      ON s.id = p.sender_id OR s.id = p.recipient_id
    WHERE lower(split_part(btrim(s.email), '@', 2)) = 'yi.mannni.com'
  ) OR EXISTS (
    SELECT 1
    FROM public.email_conversations AS c
    JOIN public.email_sender_pool AS s ON s.id = c.sender_id
    WHERE lower(split_part(btrim(s.email), '@', 2)) = 'yi.mannni.com'
  ) OR EXISTS (
    SELECT 1
    FROM public.email_messages AS m
    JOIN public.email_conversations AS c ON c.id = m.conversation_id
    JOIN public.email_sender_pool AS s ON s.id = c.sender_id
    WHERE lower(split_part(btrim(s.email), '@', 2)) = 'yi.mannni.com'
  ) THEN
    RAISE EXCEPTION
      'retired sender deletion aborted: dependent email history exists';
  END IF;

  DELETE FROM public.email_sender_pool AS s
  WHERE lower(split_part(btrim(s.email), '@', 2)) = 'yi.mannni.com';
END
$$;