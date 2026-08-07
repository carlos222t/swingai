-- SwingAI accounts + subscription schema (PostgreSQL).
-- Three plans: free, basic ($19.99/mo), premium ($39.99/mo).
-- Auth: email/username + bcrypt password_hash, no separate sessions table
-- (issue a signed JWT on login and verify it stateless server-side; add a
-- sessions table later only if you need server-side revocation).

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ---------- Plans ----------
-- Seeded, not user-editable. monthly_uploads_limit is null-safe (0 = none).
CREATE TABLE plans (
  id                      SMALLINT PRIMARY KEY,
  slug                    TEXT NOT NULL UNIQUE,        -- 'free' | 'basic' | 'premium'
  name                    TEXT NOT NULL,
  price_cents             INTEGER NOT NULL,             -- monthly price in cents, USD
  monthly_uploads_limit   INTEGER NOT NULL,             -- Upload Trade analyses per month
  includes_premium_stocks BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO plans (id, slug, name, price_cents, monthly_uploads_limit, includes_premium_stocks) VALUES
  (1, 'free',    'Free',    0,    0,  FALSE),
  (2, 'basic',   'Basic',   1999, 5,  FALSE),
  (3, 'premium', 'Premium', 3999, 15, TRUE);

-- ---------- Users ----------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- bcrypt/argon2 hash, never plaintext
  is_owner      BOOLEAN NOT NULL DEFAULT FALSE, -- can edit the Premium stocks list
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_username ON users (username);

-- ---------- Subscriptions ----------
-- One row per user's current plan. New signups get a 'free' row created
-- immediately (price_cents 0, no Stripe fields needed); upgrading to
-- basic/premium fills in the Stripe columns once checkout completes.
CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plan_id                SMALLINT NOT NULL REFERENCES plans (id),
  status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','past_due','canceled','trialing')),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT UNIQUE,
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- one active subscription per user at a time
  UNIQUE (user_id)
);

CREATE INDEX idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions (stripe_customer_id);

-- ---------- Upload usage (for the monthly Upload Trade quota) ----------
-- One row per user per calendar month; increment upload_count on each
-- successful /api/analyze-trade call, reject once it hits the plan's
-- monthly_uploads_limit.
CREATE TABLE upload_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  month_start   DATE NOT NULL,        -- always the 1st of the month, e.g. 2026-08-01
  upload_count  INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, month_start)
);

CREATE INDEX idx_upload_usage_user_month ON upload_usage (user_id, month_start);

-- ---------- Convenience view: a user's current plan + this month's usage ----------
CREATE VIEW user_plan_status AS
SELECT
  u.id AS user_id,
  u.username,
  u.email,
  u.is_owner,
  p.slug AS plan_slug,
  p.name AS plan_name,
  p.monthly_uploads_limit,
  p.includes_premium_stocks,
  s.status AS subscription_status,
  s.current_period_end,
  COALESCE(uu.upload_count, 0) AS uploads_this_month
FROM users u
JOIN subscriptions s ON s.user_id = u.id
JOIN plans p ON p.id = s.plan_id
LEFT JOIN upload_usage uu
  ON uu.user_id = u.id
  AND uu.month_start = date_trunc('month', now())::date;
