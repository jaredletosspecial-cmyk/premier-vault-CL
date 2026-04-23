-- =========================================================
-- LEGACY PORTAL DATA MIGRATION
-- =========================================================

-- Add new columns to profiles table for legacy data
ALTER TABLE public.profiles
ADD COLUMN portal_username TEXT UNIQUE,
ADD COLUMN legacy_data_uploaded BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN legacy_upload_date TIMESTAMPTZ;

-- Create table to track legacy data upload requests
CREATE TABLE public.legacy_data_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  portal_username TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending', 'Verified', 'Processing', 'Completed', 'Failed'
  error_message TEXT,
  uploaded_balance NUMERIC(14,2),
  transaction_count INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.legacy_data_uploads ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_legacy_uploads_user ON public.legacy_data_uploads(user_id);
CREATE INDEX idx_legacy_uploads_portal ON public.legacy_data_uploads(portal_username);

-- RLS POLICIES for legacy_data_uploads
CREATE POLICY "Users view own legacy uploads" ON public.legacy_data_uploads
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own legacy uploads" ON public.legacy_data_uploads
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all legacy uploads" ON public.legacy_data_uploads
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage legacy uploads" ON public.legacy_data_uploads
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Legacy user code verification table
CREATE TABLE public.legacy_user_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_username TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  account_balance NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.legacy_user_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_legacy_codes_username ON public.legacy_user_codes(portal_username);

-- Pre-populate legacy user codes for testing
INSERT INTO public.legacy_user_codes (portal_username, code, account_balance)
VALUES ('User00571J1', 'USER00571J1', 374105567.00);
