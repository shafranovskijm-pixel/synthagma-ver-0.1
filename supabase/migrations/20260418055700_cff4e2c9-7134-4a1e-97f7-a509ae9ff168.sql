-- Stage 2: Согласование с правками
-- 1) Добавляем mode и current_revision_id в document_signatures
ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'sign',
  ADD COLUMN IF NOT EXISTS current_revision_id uuid;

-- CHECK на mode
ALTER TABLE public.document_signatures DROP CONSTRAINT IF EXISTS document_signatures_mode_check;
ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_mode_check
  CHECK (mode = ANY (ARRAY['sign','review']));

-- 2) signature_revisions — версии документа
CREATE TABLE IF NOT EXISTS public.signature_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_id uuid NOT NULL REFERENCES public.document_signatures(id) ON DELETE CASCADE,
  version integer NOT NULL,
  document_html text NOT NULL,
  document_hash text,
  created_by uuid,
  created_by_name text,
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(signature_id, version)
);

CREATE INDEX IF NOT EXISTS idx_signature_revisions_signature ON public.signature_revisions(signature_id, version DESC);

ALTER TABLE public.signature_revisions ENABLE ROW LEVEL SECURITY;

-- RLS: видят те, кто видит само подписание
DROP POLICY IF EXISTS "View revisions if can view signature" ON public.signature_revisions;
CREATE POLICY "View revisions if can view signature"
ON public.signature_revisions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.document_signatures ds
    WHERE ds.id = signature_revisions.signature_id
      AND (
        ds.sender_user_id = auth.uid()
        OR ds.recipient_user_id = auth.uid()
        OR ds.organization_id = current_organization_id()
        OR has_role('admin'::app_role, auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "Insert revisions by sender or admin" ON public.signature_revisions;
CREATE POLICY "Insert revisions by sender or admin"
ON public.signature_revisions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.document_signatures ds
    WHERE ds.id = signature_revisions.signature_id
      AND (
        ds.sender_user_id = auth.uid()
        OR ds.organization_id = current_organization_id()
        OR has_role('admin'::app_role, auth.uid())
      )
  )
);

-- 3) signature_comments — комментарии к выделенному тексту
CREATE TABLE IF NOT EXISTS public.signature_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_id uuid NOT NULL REFERENCES public.document_signatures(id) ON DELETE CASCADE,
  revision_id uuid REFERENCES public.signature_revisions(id) ON DELETE SET NULL,
  author_user_id uuid,
  author_name text NOT NULL,
  author_role text NOT NULL DEFAULT 'recipient', -- 'recipient' | 'sender' | 'admin'
  quoted_text text,
  comment_text text NOT NULL,
  position_anchor jsonb, -- {start, end, context} для подсветки
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signature_comments_signature ON public.signature_comments(signature_id, created_at);

ALTER TABLE public.signature_comments ENABLE ROW LEVEL SECURITY;

-- RLS: SELECT
DROP POLICY IF EXISTS "View comments if can view signature" ON public.signature_comments;
CREATE POLICY "View comments if can view signature"
ON public.signature_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.document_signatures ds
    WHERE ds.id = signature_comments.signature_id
      AND (
        ds.sender_user_id = auth.uid()
        OR ds.recipient_user_id = auth.uid()
        OR ds.organization_id = current_organization_id()
        OR has_role('admin'::app_role, auth.uid())
      )
  )
);

-- INSERT: и получатель, и отправитель, и admin
DROP POLICY IF EXISTS "Insert comments by participants" ON public.signature_comments;
CREATE POLICY "Insert comments by participants"
ON public.signature_comments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.document_signatures ds
    WHERE ds.id = signature_comments.signature_id
      AND (
        ds.sender_user_id = auth.uid()
        OR ds.recipient_user_id = auth.uid()
        OR ds.organization_id = current_organization_id()
        OR has_role('admin'::app_role, auth.uid())
      )
  )
);

-- UPDATE: автор может resolve свой комментарий, отправитель — любые
DROP POLICY IF EXISTS "Update comments by author or sender" ON public.signature_comments;
CREATE POLICY "Update comments by author or sender"
ON public.signature_comments FOR UPDATE
USING (
  author_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.document_signatures ds
    WHERE ds.id = signature_comments.signature_id
      AND (ds.sender_user_id = auth.uid() OR ds.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  )
);

-- 4) Публичный RPC для получения комментариев и ревизий по token (для гостевого /sign/:token)
CREATE OR REPLACE FUNCTION public.get_signature_revisions_by_token(p_token text)
RETURNS TABLE(id uuid, version integer, document_html text, document_hash text, created_by_name text, change_summary text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT sr.id, sr.version, sr.document_html, sr.document_hash, sr.created_by_name, sr.change_summary, sr.created_at
  FROM public.signature_revisions sr
  JOIN public.document_signatures ds ON ds.id = sr.signature_id
  WHERE ds.signature_token = p_token
  ORDER BY sr.version ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_signature_comments_by_token(p_token text)
RETURNS TABLE(id uuid, revision_id uuid, author_name text, author_role text, quoted_text text, comment_text text, position_anchor jsonb, resolved boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT sc.id, sc.revision_id, sc.author_name, sc.author_role, sc.quoted_text, sc.comment_text, sc.position_anchor, sc.resolved, sc.created_at
  FROM public.signature_comments sc
  JOIN public.document_signatures ds ON ds.id = sc.signature_id
  WHERE ds.signature_token = p_token
  ORDER BY sc.created_at ASC;
END;
$$;

-- RPC: добавить комментарий гостем по token
CREATE OR REPLACE FUNCTION public.add_signature_comment_by_token(
  p_token text,
  p_author_name text,
  p_quoted_text text,
  p_comment_text text,
  p_position_anchor jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_sig_id uuid;
  v_rev_id uuid;
  v_org_id uuid;
  v_sender uuid;
  v_title text;
  v_new_id uuid;
BEGIN
  SELECT ds.id, ds.current_revision_id, ds.organization_id, ds.sender_user_id, ds.document_title
  INTO v_sig_id, v_rev_id, v_org_id, v_sender, v_title
  FROM public.document_signatures ds
  WHERE ds.signature_token = p_token AND ds.mode = 'review';

  IF v_sig_id IS NULL THEN RAISE EXCEPTION 'Signature not found or not in review mode'; END IF;

  INSERT INTO public.signature_comments (signature_id, revision_id, author_name, author_role, quoted_text, comment_text, position_anchor)
  VALUES (v_sig_id, v_rev_id, COALESCE(p_author_name, 'Получатель'), 'recipient', p_quoted_text, p_comment_text, p_position_anchor)
  RETURNING id INTO v_new_id;

  -- Уведомление отправителю
  INSERT INTO public.org_notifications (organization_id, user_id, type, title, message, related_id)
  VALUES (v_org_id, v_sender, 'signature', 'Новый комментарий к документу', v_title || ' — ' || left(p_comment_text, 100), v_sig_id);

  RETURN v_new_id;
END;
$$;

-- RPC: запросить правки (changes_requested)
CREATE OR REPLACE FUNCTION public.request_signature_changes(p_token text, p_summary text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.document_signatures
  SET status = 'changes_requested',
      rejection_reason = p_summary
  WHERE signature_token = p_token AND mode = 'review';
END;
$$;

-- 5) Расширяем get_signature_by_token для возврата mode
DROP FUNCTION IF EXISTS public.get_signature_by_token(text);
CREATE OR REPLACE FUNCTION public.get_signature_by_token(p_token text)
RETURNS TABLE(id uuid, document_type text, document_title text, document_html text, document_hash text, organization_id uuid, organization_name text, organization_inn text, recipient_email text, recipient_name text, recipient_user_id uuid, status text, mode text, current_revision_id uuid, expires_at timestamptz, signed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ds.id, ds.document_type, ds.document_title, ds.document_html, ds.document_hash,
    ds.organization_id, o.name, o.inn,
    ds.recipient_email, ds.recipient_name, ds.recipient_user_id,
    ds.status, ds.mode, ds.current_revision_id, ds.expires_at, ds.signed_at
  FROM public.document_signatures ds
  JOIN public.organizations o ON o.id = ds.organization_id
  WHERE ds.signature_token = p_token
  LIMIT 1;
END;
$$;