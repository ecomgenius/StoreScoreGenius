
-- Create subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  stripe_price_id TEXT UNIQUE NOT NULL,
  stripe_product_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd' NOT NULL,
  interval TEXT DEFAULT 'month' NOT NULL,
  ai_credits_included INTEGER DEFAULT 0 NOT NULL,
  max_stores INTEGER DEFAULT 1 NOT NULL,
  features JSONB DEFAULT '[]' NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  trial_days INTEGER DEFAULT 7 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create user subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  plan_id INTEGER REFERENCES subscription_plans(id) NOT NULL,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  trial_start TIMESTAMP,
  trial_end TIMESTAMP,
  canceled_at TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Add indexes
CREATE INDEX IF NOT EXISTS subscription_plans_stripe_price_id_idx ON subscription_plans(stripe_price_id);
CREATE INDEX IF NOT EXISTS user_subscriptions_user_id_idx ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS user_subscriptions_stripe_subscription_id_idx ON user_subscriptions(stripe_subscription_id);

-- Update users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_status;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_id;
ALTER TABLE users DROP COLUMN IF EXISTS trial_ends_at;

-- Insert sample plans
INSERT INTO subscription_plans (name, description, stripe_price_id, stripe_product_id, price, ai_credits_included, max_stores, features) VALUES
('Starter', 'Perfect for small stores', 'price_starter', 'prod_starter', 2900, 100, 1, '["Basic analysis", "Email support"]'),
('Professional', 'For growing businesses', 'price_pro', 'prod_pro', 4900, 300, 5, '["Advanced analysis", "Priority support", "Custom reports"]'),
('Enterprise', 'For large operations', 'price_enterprise', 'prod_enterprise', 9900, 1000, 50, '["Everything included", "Dedicated support", "Custom integrations"]')
ON CONFLICT (stripe_price_id) DO NOTHING;
