import type { PoolClient } from "pg";
import { queryDatabase, withDatabaseTransaction } from "./database.service.js";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string | null;
  seniority_id: string | null;
  seniority_code: string | null;
  seniority_name: string | null;
  seniority_sort_order: number | null;
  seniority_is_active: boolean | null;
  worker_type_id: string | null;
  worker_type_code: string | null;
  worker_type_name: string | null;
  worker_type_source: string | null;
  worker_type_is_active: boolean | null;
  created_at: Date;
  updated_at: Date;
}

interface UserDepartmentRow {
  user_id: string;
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

interface CreateUserInput {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
  departmentIds: string[];
  seniorityId: string | null;
  workerTypeId: string | null;
}

interface UpdateUserInput {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
  departmentIds: string[];
  seniorityId: string | null;
  workerTypeId: string | null;
}

export interface UserDepartment {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface UserSeniority {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface UserWorkerType {
  id: string;
  code: string;
  name: string;
  source: string;
  isActive: boolean;
}

export interface UserRecord extends UserRow {
  departments: UserDepartment[];
  seniority: UserSeniority | null;
  workerType: UserWorkerType | null;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
  departments: UserDepartment[];
  seniority: UserSeniority | null;
  workerType: UserWorkerType | null;
}

type Queryable = Pick<PoolClient, "query">;

function normalizeDepartmentIds(departmentIds: string[]): string[] {
  return Array.from(new Set(departmentIds.map((id) => id.trim()).filter(Boolean)));
}

function mapDepartment(row: UserDepartmentRow): UserDepartment {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    isActive: row.is_active,
  };
}

function mapSeniority(row: UserRow): UserSeniority | null {
  if (!row.seniority_id || !row.seniority_code || !row.seniority_name) {
    return null;
  }

  return {
    id: row.seniority_id,
    code: row.seniority_code,
    name: row.seniority_name,
    sortOrder: row.seniority_sort_order ?? 0,
    isActive: row.seniority_is_active ?? false,
  };
}

function mapWorkerType(row: UserRow): UserWorkerType | null {
  if (!row.worker_type_id || !row.worker_type_code || !row.worker_type_name) {
    return null;
  }

  return {
    id: row.worker_type_id,
    code: row.worker_type_code,
    name: row.worker_type_name,
    source: row.worker_type_source ?? "unknown",
    isActive: row.worker_type_is_active ?? false,
  };
}

function mapUser(row: UserRow, departments: UserDepartment[]): UserProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    phone: row.phone,
    departments,
    seniority: mapSeniority(row),
    workerType: mapWorkerType(row),
  };
}

async function getDepartmentsForUserIds(userIds: string[]): Promise<Map<string, UserDepartment[]>> {
  const map = new Map<string, UserDepartment[]>();
  if (userIds.length === 0) return map;

  const result = await queryDatabase<UserDepartmentRow>(
    `SELECT ud.user_id,
            d.id::text AS id,
            d.name,
            d.code,
            d.is_active
     FROM user_departments ud
     INNER JOIN departments d ON d.id = ud.department_id
     WHERE ud.user_id = ANY($1::varchar[])
     ORDER BY d.name ASC`,
    [userIds],
  );

  for (const row of result.rows) {
    const list = map.get(row.user_id) ?? [];
    list.push(mapDepartment(row));
    map.set(row.user_id, list);
  }

  return map;
}

async function getDepartmentsForUserId(userId: string): Promise<UserDepartment[]> {
  const departmentsByUser = await getDepartmentsForUserIds([userId]);
  return departmentsByUser.get(userId) ?? [];
}

async function assertDepartmentsExist(client: Queryable, departmentIds: string[]): Promise<void> {
  if (departmentIds.length === 0) return;

  const result = await client.query<{ id: string }>(
    `SELECT id::text AS id
     FROM departments
     WHERE id = ANY($1::uuid[])`,
    [departmentIds],
  );

  if (result.rows.length !== departmentIds.length) {
    throw new Error("One or more departments do not exist");
  }
}

async function replaceUserDepartments(
  client: Queryable,
  userId: string,
  rawDepartmentIds: string[],
): Promise<void> {
  const departmentIds = normalizeDepartmentIds(rawDepartmentIds);
  await assertDepartmentsExist(client, departmentIds);

  await client.query("DELETE FROM user_departments WHERE user_id = $1", [userId]);

  for (const departmentId of departmentIds) {
    await client.query(
      `INSERT INTO user_departments (user_id, department_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, department_id) DO NOTHING`,
      [userId, departmentId],
    );
  }
}

export const UserService = {
  async getUserById(userId: string): Promise<UserProfile | null> {
    const result = await queryDatabase<UserRow>(
      `SELECT u.id,
              u.email,
              u.full_name,
              u.role,
              u.phone,
              u.seniority_id::text AS seniority_id,
              s.code AS seniority_code,
              s.name AS seniority_name,
              s.sort_order AS seniority_sort_order,
              s.is_active AS seniority_is_active,
              u.worker_type_id::text AS worker_type_id,
              wt.code AS worker_type_code,
              wt.name AS worker_type_name,
              wt.source AS worker_type_source,
              wt.is_active AS worker_type_is_active,
              u.created_at,
              u.updated_at
       FROM users u
       LEFT JOIN seniorities s ON s.id = u.seniority_id
       LEFT JOIN worker_types wt ON wt.id = u.worker_type_id
       WHERE u.id = $1`,
      [userId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return mapUser(row, await getDepartmentsForUserId(row.id));
  },

  async getUserByEmail(email: string): Promise<UserProfile | null> {
    const result = await queryDatabase<UserRow>(
      `SELECT u.id,
              u.email,
              u.full_name,
              u.role,
              u.phone,
              u.seniority_id::text AS seniority_id,
              s.code AS seniority_code,
              s.name AS seniority_name,
              s.sort_order AS seniority_sort_order,
              s.is_active AS seniority_is_active,
              u.worker_type_id::text AS worker_type_id,
              wt.code AS worker_type_code,
              wt.name AS worker_type_name,
              wt.source AS worker_type_source,
              wt.is_active AS worker_type_is_active,
              u.created_at,
              u.updated_at
       FROM users u
       LEFT JOIN seniorities s ON s.id = u.seniority_id
       LEFT JOIN worker_types wt ON wt.id = u.worker_type_id
       WHERE LOWER(u.email) = LOWER($1)
       LIMIT 1`,
      [email],
    );

    const row = result.rows[0];
    if (!row) return null;

    return mapUser(row, await getDepartmentsForUserId(row.id));
  },

  async getUserByIdOrEmail(userId: string, email: string): Promise<UserProfile | null> {
    const byId = await this.getUserById(userId);
    if (byId) return byId;

    return this.getUserByEmail(email);
  },

  async listUsers(): Promise<UserRecord[]> {
    const result = await queryDatabase<UserRow>(
      `SELECT u.id,
              u.email,
              u.full_name,
              u.role,
              u.phone,
              u.seniority_id::text AS seniority_id,
              s.code AS seniority_code,
              s.name AS seniority_name,
              s.sort_order AS seniority_sort_order,
              s.is_active AS seniority_is_active,
              u.worker_type_id::text AS worker_type_id,
              wt.code AS worker_type_code,
              wt.name AS worker_type_name,
              wt.source AS worker_type_source,
              wt.is_active AS worker_type_is_active,
              u.created_at,
              u.updated_at
       FROM users u
       LEFT JOIN seniorities s ON s.id = u.seniority_id
       LEFT JOIN worker_types wt ON wt.id = u.worker_type_id
       ORDER BY u.created_at DESC`,
    );

    const departmentsByUser = await getDepartmentsForUserIds(result.rows.map((row) => row.id));
    return result.rows.map((row) => ({
      ...row,
      departments: departmentsByUser.get(row.id) ?? [],
      seniority: mapSeniority(row),
      workerType: mapWorkerType(row),
    }));
  },

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const created = await withDatabaseTransaction(async (client) => {
      const result = await client.query<UserRow>(
        `INSERT INTO users (id, email, full_name, role, phone, seniority_id, worker_type_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id,
                   email,
                   full_name,
                   role,
                   phone,
                   seniority_id::text AS seniority_id,
                   NULL::text AS seniority_code,
                   NULL::text AS seniority_name,
                   NULL::integer AS seniority_sort_order,
                   NULL::boolean AS seniority_is_active,
                   worker_type_id::text AS worker_type_id,
                   NULL::text AS worker_type_code,
                   NULL::text AS worker_type_name,
                   NULL::text AS worker_type_source,
                   NULL::boolean AS worker_type_is_active,
                   created_at,
                   updated_at`,
        [
          input.id,
          input.email,
          input.fullName,
          input.role,
          input.phone,
          input.seniorityId,
          input.workerTypeId,
        ],
      );

      const row = result.rows[0] as UserRow;
      await replaceUserDepartments(client, row.id, input.departmentIds);
      return row;
    });

    const profile = await this.getUserById(created.id);
    return {
      ...created,
      departments: profile?.departments ?? (await getDepartmentsForUserId(created.id)),
      seniority: profile?.seniority ?? null,
      workerType: profile?.workerType ?? null,
    };
  },

  async updateUser(input: UpdateUserInput): Promise<UserRecord | null> {
    const updated = await withDatabaseTransaction(async (client) => {
      const result = await client.query<UserRow>(
        `UPDATE users
         SET email = $2,
             full_name = $3,
             role = $4,
             phone = $5,
             seniority_id = $6,
             worker_type_id = $7,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id,
                   email,
                   full_name,
                   role,
                   phone,
                   seniority_id::text AS seniority_id,
                   NULL::text AS seniority_code,
                   NULL::text AS seniority_name,
                   NULL::integer AS seniority_sort_order,
                   NULL::boolean AS seniority_is_active,
                   worker_type_id::text AS worker_type_id,
                   NULL::text AS worker_type_code,
                   NULL::text AS worker_type_name,
                   NULL::text AS worker_type_source,
                   NULL::boolean AS worker_type_is_active,
                   created_at,
                   updated_at`,
        [
          input.id,
          input.email,
          input.fullName,
          input.role,
          input.phone,
          input.seniorityId,
          input.workerTypeId,
        ],
      );

      const row = result.rows[0];
      if (!row) return null;

      await replaceUserDepartments(client, row.id, input.departmentIds);
      return row;
    });

    if (!updated) return null;

    const profile = await this.getUserById(updated.id);
    return {
      ...updated,
      departments: profile?.departments ?? (await getDepartmentsForUserId(updated.id)),
      seniority: profile?.seniority ?? null,
      workerType: profile?.workerType ?? null,
    };
  },

  async deleteUser(userId: string): Promise<boolean> {
    const result = await queryDatabase<{ id: string }>(
      `DELETE FROM users WHERE id = $1 RETURNING id`,
      [userId],
    );

    return result.rows.length > 0;
  },
};
