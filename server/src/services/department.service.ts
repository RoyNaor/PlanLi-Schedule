import { queryDatabase } from "./database.service.js";

interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  users_count: string;
  created_at: Date;
  updated_at: Date;
}

interface CreateDepartmentInput {
  name: string;
  code: string;
}

interface UpdateDepartmentInput {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  usersCount: number;
  createdAt: string;
  updatedAt: string;
}

function mapDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    isActive: row.is_active,
    usersCount: Number(row.users_count),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export const DepartmentService = {
  async listDepartments(): Promise<Department[]> {
    const result = await queryDatabase<DepartmentRow>(
      `SELECT d.id::text AS id,
              d.name,
              d.code,
              d.is_active,
              COUNT(ud.user_id)::text AS users_count,
              d.created_at,
              d.updated_at
       FROM departments d
       LEFT JOIN user_departments ud ON ud.department_id = d.id
       GROUP BY d.id, d.name, d.code, d.is_active, d.created_at, d.updated_at
       ORDER BY d.is_active DESC, d.name ASC`,
    );

    return result.rows.map(mapDepartment);
  },

  async createDepartment(input: CreateDepartmentInput): Promise<Department> {
    const result = await queryDatabase<DepartmentRow>(
      `INSERT INTO departments (name, code)
       VALUES ($1, $2)
       RETURNING id::text AS id,
                 name,
                 code,
                 is_active,
                 '0'::text AS users_count,
                 created_at,
                 updated_at`,
      [input.name, input.code],
    );

    return mapDepartment(result.rows[0] as DepartmentRow);
  },

  async updateDepartment(input: UpdateDepartmentInput): Promise<Department | null> {
    const result = await queryDatabase<DepartmentRow>(
      `UPDATE departments
       SET name = $2,
           code = $3,
           is_active = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id::text AS id,
                 name,
                 code,
                 is_active,
                 (SELECT COUNT(*)::text FROM user_departments WHERE department_id = departments.id) AS users_count,
                 created_at,
                 updated_at`,
      [input.id, input.name, input.code, input.isActive],
    );

    const row = result.rows[0];
    return row ? mapDepartment(row) : null;
  },

  async getDepartmentById(departmentId: string): Promise<Department | null> {
    const result = await queryDatabase<DepartmentRow>(
      `SELECT d.id::text AS id,
              d.name,
              d.code,
              d.is_active,
              COUNT(ud.user_id)::text AS users_count,
              d.created_at,
              d.updated_at
       FROM departments d
       LEFT JOIN user_departments ud ON ud.department_id = d.id
       WHERE d.id = $1
       GROUP BY d.id, d.name, d.code, d.is_active, d.created_at, d.updated_at`,
      [departmentId],
    );

    const row = result.rows[0];
    return row ? mapDepartment(row) : null;
  },

  async getDepartmentByCode(code: string): Promise<Department | null> {
    const result = await queryDatabase<DepartmentRow>(
      `SELECT d.id::text AS id,
              d.name,
              d.code,
              d.is_active,
              COUNT(ud.user_id)::text AS users_count,
              d.created_at,
              d.updated_at
       FROM departments d
       LEFT JOIN user_departments ud ON ud.department_id = d.id
       WHERE LOWER(d.code) = LOWER($1)
       GROUP BY d.id, d.name, d.code, d.is_active, d.created_at, d.updated_at
       LIMIT 1`,
      [code],
    );

    const row = result.rows[0];
    return row ? mapDepartment(row) : null;
  },

  async getDefaultDepartmentId(): Promise<string | null> {
    const result = await queryDatabase<{ id: string }>(
      `SELECT id::text AS id
       FROM departments
       WHERE code = 'default'
       LIMIT 1`,
    );

    return result.rows[0]?.id ?? null;
  },

  async countExistingDepartments(departmentIds: string[]): Promise<number> {
    if (departmentIds.length === 0) return 0;

    const result = await queryDatabase<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM departments
       WHERE id = ANY($1::uuid[])`,
      [departmentIds],
    );

    return Number(result.rows[0]?.count ?? 0);
  },
};
