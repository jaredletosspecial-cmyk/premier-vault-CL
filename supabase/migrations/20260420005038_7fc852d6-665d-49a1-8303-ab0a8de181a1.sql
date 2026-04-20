
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.withdrawal_method AS ENUM ('bank', 'crypto');
CREATE TYPE public.investment_status AS ENUM ('Active', 'Matured', 'Cancelled');
CREATE TYPE public.transaction_type AS ENUM ('Deposit', 'Withdrawal', 'Investment', 'ROI Payout');
CREATE TYPE public.transaction_status AS ENUM ('Pending', 'Completed', 'Failed', 'Rejected');
CREATE TYPE public.request_status AS ENUM ('Pending', 'Approved', 'Rejected', 'Completed');

-- =========================================================
-- UTIL: updated_at trigger
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  wallet_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (wallet_balance >= 0),
  email_alerts BOOLEAN NOT NULL DEFAULT true,
  deposit_alerts BOOLEAN NOT NULL DEFAULT true,
  withdrawal_alerts BOOLEAN NOT NULL DEFAULT true,
  payout_alerts BOOLEAN NOT NULL DEFAULT true,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- USER ROLES (separate table — security best practice)
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================================================
-- HANDLE NEW USER: auto-create profile + default role
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- WITHDRAWAL DETAILS
-- =========================================================
CREATE TABLE public.withdrawal_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  method public.withdrawal_method NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,
  sort_code TEXT,
  network TEXT,
  wallet_address TEXT,
  preferred_currency TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.withdrawal_details ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_wd_updated_at BEFORE UPDATE ON public.withdrawal_details
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- INVESTMENT PLANS
-- =========================================================
CREATE TABLE public.investment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  min_amount NUMERIC(14,2) NOT NULL,
  max_amount NUMERIC(14,2) NOT NULL,
  weekly_roi_rate NUMERIC(5,2) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.investment_plans ENABLE ROW LEVEL SECURITY;

INSERT INTO public.investment_plans (name, min_amount, max_amount, weekly_roi_rate, display_order) VALUES
  ('Starter EXCO',     500,    5000,   2.5, 1),
  ('Premier Elite',    5100,   20000,  4.2, 2),
  ('Executive Trust',  20100,  100000, 6.8, 3);

-- =========================================================
-- INVESTMENTS
-- =========================================================
CREATE TABLE public.investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.investment_plans(id),
  plan_name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  weekly_roi_rate NUMERIC(5,2) NOT NULL,
  weekly_return NUMERIC(14,2) NOT NULL,
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_payout_date TIMESTAMPTZ NOT NULL,
  status public.investment_status NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_investments_user ON public.investments(user_id);

-- =========================================================
-- TRANSACTIONS (audit trail)
-- =========================================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  fee NUMERIC(14,2) NOT NULL DEFAULT 0,
  status public.transaction_status NOT NULL DEFAULT 'Pending',
  reference TEXT NOT NULL UNIQUE,
  description TEXT,
  related_request_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tx_user_date ON public.transactions(user_id, created_at DESC);

-- =========================================================
-- DEPOSIT REQUESTS (admin approval queue)
-- =========================================================
CREATE TABLE public.deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 100 AND amount <= 50000),
  payment_method TEXT NOT NULL,
  payment_reference TEXT,
  status public.request_status NOT NULL DEFAULT 'Pending',
  admin_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_deposit_req_status ON public.deposit_requests(status, created_at DESC);

-- =========================================================
-- WITHDRAWAL REQUESTS (admin approval queue)
-- =========================================================
CREATE TABLE public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 50 AND amount <= 10000),
  fee NUMERIC(14,2) NOT NULL,
  net_amount NUMERIC(14,2) NOT NULL,
  withdrawal_details_snapshot JSONB NOT NULL,
  status public.request_status NOT NULL DEFAULT 'Pending',
  admin_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_withdrawal_req_status ON public.withdrawal_requests(status, created_at DESC);

-- =========================================================
-- VERIFICATION CODES (server-side 6-digit OTP)
-- =========================================================
CREATE TABLE public.verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL, -- 'withdrawal_details' | 'withdrawal' | 'profile_change'
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_codes_user_purpose ON public.verification_codes(user_id, purpose, used);

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- profiles
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update all profiles" ON public.profiles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- withdrawal_details
CREATE POLICY "Users view own withdrawal details" ON public.withdrawal_details
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own withdrawal details" ON public.withdrawal_details
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own withdrawal details" ON public.withdrawal_details
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins view all withdrawal details" ON public.withdrawal_details
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- investment_plans (public read)
CREATE POLICY "Anyone can view active plans" ON public.investment_plans
  FOR SELECT USING (active = true);
CREATE POLICY "Admins manage plans" ON public.investment_plans
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- investments
CREATE POLICY "Users view own investments" ON public.investments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own investments" ON public.investments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all investments" ON public.investments
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update investments" ON public.investments
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- transactions
CREATE POLICY "Users view own transactions" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own transactions" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all transactions" ON public.transactions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update transactions" ON public.transactions
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- deposit_requests
CREATE POLICY "Users view own deposit requests" ON public.deposit_requests
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own deposit requests" ON public.deposit_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all deposit requests" ON public.deposit_requests
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update deposit requests" ON public.deposit_requests
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- withdrawal_requests
CREATE POLICY "Users view own withdrawal requests" ON public.withdrawal_requests
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own withdrawal requests" ON public.withdrawal_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all withdrawal requests" ON public.withdrawal_requests
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update withdrawal requests" ON public.withdrawal_requests
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- verification_codes
CREATE POLICY "Users view own codes" ON public.verification_codes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own codes" ON public.verification_codes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own codes" ON public.verification_codes
  FOR UPDATE USING (auth.uid() = user_id);
