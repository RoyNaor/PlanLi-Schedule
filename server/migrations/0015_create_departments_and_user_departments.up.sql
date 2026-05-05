CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(80) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_departments (
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, department_id)
);

CREATE INDEX departments_active_name_idx ON departments(is_active, name);
CREATE INDEX user_departments_department_idx ON user_departments(department_id);

WITH default_department AS (
  INSERT INTO departments (name, code)
  VALUES ('Default Department', 'default')
  ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
  RETURNING id
)
INSERT INTO user_departments (user_id, department_id)
SELECT u.id, default_department.id
FROM users u
CROSS JOIN default_department
WHERE u.role <> 'admin'
ON CONFLICT (user_id, department_id) DO NOTHING;
