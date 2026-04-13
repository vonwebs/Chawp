-- Add split payment fields, payment ledger table, and account lifecycle columns

-- ==================== Vendors: payout + lifecycle fields ====================
ALTER TABLE IF EXISTS public.chawp_vendors
  ADD COLUMN IF NOT EXISTS payment_platform TEXT,
  ADD COLUMN IF NOT EXISTS payment_account TEXT,
  ADD COLUMN IF NOT EXISTS account_code TEXT,
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_currency TEXT DEFAULT 'GHS',
  ADD COLUMN IF NOT EXISTS account_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subaccount_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chawp_vendors_payment_account_unique
  ON public.chawp_vendors(payment_account)
  WHERE payment_account IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chawp_vendors_account_verified
  ON public.chawp_vendors(account_verified);

CREATE INDEX IF NOT EXISTS idx_chawp_vendors_deleted_at
  ON public.chawp_vendors(deleted_at);

-- ==================== Delivery personnel: lifecycle fields ====================
ALTER TABLE IF EXISTS public.chawp_delivery_personnel
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_chawp_delivery_personnel_active
  ON public.chawp_delivery_personnel(is_active);

CREATE INDEX IF NOT EXISTS idx_chawp_delivery_personnel_deleted_at
  ON public.chawp_delivery_personnel(deleted_at);

-- ==================== Payment ledger table ====================
CREATE TABLE IF NOT EXISTS public.chawp_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_provider TEXT NOT NULL DEFAULT 'paystack',
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL DEFAULT 'initialized'
    CHECK (status IN ('initialized', 'processing', 'paid', 'failed', 'cancelled')),
  split_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (split_mode IN ('none', 'single_subaccount', 'split_group')),
  split_code TEXT,
  subaccounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  items_subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
  service_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  paystack_transaction_id BIGINT,
  paystack_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(reference)
);

CREATE INDEX IF NOT EXISTS idx_chawp_payments_user_id
  ON public.chawp_payments(user_id);

CREATE INDEX IF NOT EXISTS idx_chawp_payments_status
  ON public.chawp_payments(status);

CREATE INDEX IF NOT EXISTS idx_chawp_payments_created_at
  ON public.chawp_payments(created_at DESC);

CREATE OR REPLACE FUNCTION public.update_chawp_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_chawp_payments_updated_at ON public.chawp_payments;
CREATE TRIGGER trigger_update_chawp_payments_updated_at
  BEFORE UPDATE ON public.chawp_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chawp_payments_updated_at();

ALTER TABLE public.chawp_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own chawp payments" ON public.chawp_payments;
CREATE POLICY "Users can view own chawp payments"
  ON public.chawp_payments
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all chawp payments" ON public.chawp_payments;
CREATE POLICY "Admins can view all chawp payments"
  ON public.chawp_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.chawp_user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Service role can manage chawp payments" ON public.chawp_payments;
CREATE POLICY "Service role can manage chawp payments"
  ON public.chawp_payments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.chawp_payments IS 'Payment-level ledger used for Paystack split initialization and idempotent verification';
COMMENT ON COLUMN public.chawp_vendors.payment_account IS 'Paystack subaccount code for vendor settlement';
COMMENT ON COLUMN public.chawp_vendors.account_verified IS 'Whether admin approved the payout account for settlement';
COMMENT ON COLUMN public.chawp_vendors.deleted_at IS 'Soft deletion timestamp for vendor account deactivation';
COMMENT ON COLUMN public.chawp_delivery_personnel.deleted_at IS 'Soft deletion timestamp for delivery account deactivation';
