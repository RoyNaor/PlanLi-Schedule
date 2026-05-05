CREATE TABLE seniorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX seniorities_active_sort_name_idx ON seniorities(is_active, sort_order, name);

INSERT INTO seniorities (code, name, sort_order)
VALUES
  ('intern', 'Intern', 10),
  ('regular', 'Regular', 20),
  ('senior', 'Senior', 30)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

ALTER TABLE users
ADD COLUMN seniority_id UUID REFERENCES seniorities(id) ON DELETE SET NULL;

UPDATE users
SET seniority_id = (
  SELECT id
  FROM seniorities
  WHERE code = 'regular'
  LIMIT 1
)
WHERE role <> 'admin'
  AND seniority_id IS NULL;
