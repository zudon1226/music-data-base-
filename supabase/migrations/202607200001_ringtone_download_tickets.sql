-- Short-lived, single-use iPhone Safari ringtone download tickets.
-- Only the ticket hash is stored; the raw ticket is returned once to the client.

CREATE TABLE IF NOT EXISTS public.ringtone_download_tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_hash text NOT NULL UNIQUE,
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    ringtone_id uuid NOT NULL,
    purchase_id uuid NULL,
    storage_path text NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ringtone_download_tickets_expires_at_idx
    ON public.ringtone_download_tickets (expires_at);

CREATE INDEX IF NOT EXISTS ringtone_download_tickets_user_ringtone_idx
    ON public.ringtone_download_tickets (user_id, ringtone_id);

ALTER TABLE public.ringtone_download_tickets ENABLE ROW LEVEL SECURITY;

-- Service-role API only; no direct client access.
DROP POLICY IF EXISTS ringtone_download_tickets_no_direct_access ON public.ringtone_download_tickets;
CREATE POLICY ringtone_download_tickets_no_direct_access
    ON public.ringtone_download_tickets
    FOR ALL
    TO authenticated, anon
    USING (false)
    WITH CHECK (false);
