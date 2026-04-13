-- Add rich order item details and automatic payout support

-- 1) Persist selected meal options in order items for downstream UIs
ALTER TABLE IF EXISTS public.chawp_order_items
  ADD COLUMN IF NOT EXISTS selected_size TEXT,
  ADD COLUMN IF NOT EXISTS selected_specifications TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
  ADD COLUMN IF NOT EXISTS meal_image TEXT;

-- 2) Ensure delivery personnel can receive split payouts
ALTER TABLE IF EXISTS public.chawp_delivery_personnel
  ADD COLUMN IF NOT EXISTS payment_platform TEXT,
  ADD COLUMN IF NOT EXISTS payment_account TEXT,
  ADD COLUMN IF NOT EXISTS account_code TEXT,
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_currency TEXT DEFAULT 'GHS',
  ADD COLUMN IF NOT EXISTS account_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subaccount_created_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chawp_delivery_personnel_payment_account_unique
  ON public.chawp_delivery_personnel(payment_account)
  WHERE payment_account IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chawp_delivery_personnel_account_verified
  ON public.chawp_delivery_personnel(account_verified);

-- 3) Vendor payout ledger used by admin/vendor views and auto-settlement writes
CREATE TABLE IF NOT EXISTS public.chawp_vendor_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.chawp_vendors(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  payment_method TEXT,
  reference_number TEXT,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chawp_vendor_payouts_vendor_id
  ON public.chawp_vendor_payouts(vendor_id);

CREATE INDEX IF NOT EXISTS idx_chawp_vendor_payouts_status
  ON public.chawp_vendor_payouts(status);

CREATE INDEX IF NOT EXISTS idx_chawp_vendor_payouts_created_at
  ON public.chawp_vendor_payouts(created_at DESC);

CREATE OR REPLACE FUNCTION public.update_chawp_vendor_payouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_chawp_vendor_payouts_updated_at ON public.chawp_vendor_payouts;
CREATE TRIGGER trigger_update_chawp_vendor_payouts_updated_at
  BEFORE UPDATE ON public.chawp_vendor_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chawp_vendor_payouts_updated_at();

ALTER TABLE public.chawp_vendor_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all vendor payouts" ON public.chawp_vendor_payouts;
CREATE POLICY "Admins can view all vendor payouts"
  ON public.chawp_vendor_payouts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.chawp_user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Vendors can view own payouts" ON public.chawp_vendor_payouts;
CREATE POLICY "Vendors can view own payouts"
  ON public.chawp_vendor_payouts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.chawp_vendors
      WHERE id = vendor_id
      AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can manage vendor payouts" ON public.chawp_vendor_payouts;
CREATE POLICY "Service role can manage vendor payouts"
  ON public.chawp_vendor_payouts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4) De-duplicate delivery earnings for same order/type to avoid accidental double inserts
WITH ranked_delivery_earnings AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY order_id, type
      ORDER BY earned_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.chawp_delivery_earnings
  WHERE order_id IS NOT NULL
)
DELETE FROM public.chawp_delivery_earnings e
USING ranked_delivery_earnings r
WHERE e.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_earnings_order_type_unique
  ON public.chawp_delivery_earnings(order_id, type)
  WHERE order_id IS NOT NULL;
