import { getWeekStartSundayInIsrael } from "../utils/chat.utils.js";
import type { UserStatus } from "../utils/userStatus.utils.js";
import { resolveUserStatusFromReasons } from "../utils/userStatus.utils.js";
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

interface DepartmentUserMembershipRow {
  department_id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  user_id: string | null;
  user_role: string | null;
  seniority_code: string | null;
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

export interface DepartmentUserStats {
  total: number;
  byStatus: Record<UserStatus, number>;
  bySeniority: {
    senior: number;
    regular: number;
    intern: number;
    none: number;
  };
  byRole: Record<string, number>;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  usersCount: number;
  userStats: DepartmentUserStats;
  createdAt: string;
  updatedAt: string;
}

function emptyDepartmentUserStats(): DepartmentUserStats {
  return {
    total: 0,
    byStatus: {
      active: 0,
      sick: 0,
      course: 0,
      vacation: 0,
      leave: 0,
      other: 0,
    },
    bySeniority: {
      senior: 0,
      regular: 0,
      intern: 0,
      none: 0,
    },
    byRole: {},
  };
}

function bumpSeniority(stats: DepartmentUserStats["bySeniority"], code: string | null) {
  if (!code) {
    stats.none += 1;
    return;
  }
  switch (code) {
    case "senior":
      stats.senior += 1;
      break;
    case "regular":
      stats.regular += 1;
      break;
    case "intern":
      stats.intern += 1;
      break;
    default:
      stats.none += 1;
  }
}

function aggregateStatsForUsers(
  users: Map<string, { role: string; seniorityCode: string | null }>,
  reasonsByUser: Map<string, string[]>,
): DepartmentUserStats {
  const stats = emptyDepartmentUserStats();
  stats.total = users.size;

  for (const [userId, { role, seniorityCode }] of users) {
    const reasons = reasonsByUser.get(userId) ?? [];
    const status = resolveUserStatusFromReasons(reasons);
    stats.byStatus[status] += 1;

    bumpSeniority(stats.bySeniority, seniorityCode);

    stats.byRole[role] = (stats.byRole[role] ?? 0) + 1;
  }

  return stats;
}

async function loadConstraintReasonsByUser(weekStart: string): Promise<Map<string, string[]>> {
  const result = await queryDatabase<{ user_id: string; reason: string | null }>(
    `SELECT user_id, reason
     FROM constraints
     WHERE priority = 'HARD'
       AND is_full_day = TRUE
       AND week_start = $1::date`,
    [weekStart],
  );

  const map = new Map<string, string[]>();
  for (const row of result.rows) {
    const list = map.get(row.user_id) ?? [];
    list.push(row.reason ?? "");
    map.set(row.user_id, list);
  }
  return map;
}

function mapDepartment(row: DepartmentRow, userStats: DepartmentUserStats): Department {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    isActive: row.is_active,
    usersCount: Number(row.users_count),
    userStats,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function buildUserStatsForAllDepartments(
  weekStart: string,
): Promise<Map<string, DepartmentUserStats>> {
  const reasonsByUser = await loadConstraintReasonsByUser(weekStart);

  const membership = await queryDatabase<DepartmentUserMembershipRow>(
    `SELECT d.id::text AS department_id,
            d.name,
            d.code,
            d.is_active,
            d.created_at,
            d.updated_at,
            u.id::text AS user_id,
            u.role AS user_role,
            s.code AS seniority_code
     FROM departments d
     LEFT JOIN user_departments ud ON ud.department_id = d.id
     LEFT JOIN users u ON u.id = ud.user_id
     LEFT JOIN seniorities s ON s.id = u.seniority_id
     ORDER BY d.is_active DESC, d.name ASC, u.id ASC`,
  );

  const userMaps = new Map<string, Map<string, { role: string; seniorityCode: string | null }>>();

  for (const row of membership.rows) {
    if (!row.user_id) continue;

    let umap = userMaps.get(row.department_id);
    if (!umap) {
      umap = new Map();
      userMaps.set(row.department_id, umap);
    }

    umap.set(row.user_id, {
      role: row.user_role ?? "unknown",
      seniorityCode: row.seniority_code,
    });
  }

  const orderedDeptIds: string[] = [];
  const seen = new Set<string>();
  for (const row of membership.rows) {
    if (!seen.has(row.department_id)) {
      seen.add(row.department_id);
      orderedDeptIds.push(row.department_id);
    }
  }

  const statsByDept = new Map<string, DepartmentUserStats>();
  for (const deptId of orderedDeptIds) {
    const umap = userMaps.get(deptId) ?? new Map();
    statsByDept.set(deptId, aggregateStatsForUsers(umap, reasonsByUser));
  }

  return statsByDept;
}

async function userStatsForDepartment(
  departmentId: string,
  reasonsByUser: Map<string, string[]>,
): Promise<DepartmentUserStats> {
  const result = await queryDatabase<{
    user_id: string;
    user_role: string | null;
    seniority_code: string | null;
  }>(
    `SELECT u.id::text AS user_id,
            u.role AS user_role,
            s.code AS seniority_code
     FROM user_departments ud
     JOIN users u ON u.id = ud.user_id
     LEFT JOIN seniorities s ON s.id = u.seniority_id
     WHERE ud.department_id = $1`,
    [departmentId],
  );

  const umap = new Map<string, { role: string; seniorityCode: string | null }>();
  for (const row of result.rows) {
    umap.set(row.user_id, {
      role: row.user_role ?? "unknown",
      seniorityCode: row.seniority_code,
    });
  }

  return aggregateStatsForUsers(umap, reasonsByUser);
}

export const DepartmentService = {
  async listDepartments(): Promise<Department[]> {
    const weekStart = getWeekStartSundayInIsrael(new Date());
    const statsByDept = await buildUserStatsForAllDepartments(weekStart);

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

    return result.rows.map((row) =>
      mapDepartment(row, statsByDept.get(row.id) ?? emptyDepartmentUserStats()),
    );
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

    return mapDepartment(result.rows[0] as DepartmentRow, emptyDepartmentUserStats());
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
    if (!row) return null;

    const weekStart = getWeekStartSundayInIsrael(new Date());
    const reasonsByUser = await loadConstraintReasonsByUser(weekStart);
    const userStats = await userStatsForDepartment(input.id, reasonsByUser);

    return mapDepartment(row, userStats);
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
    if (!row) return null;

    const weekStart = getWeekStartSundayInIsrael(new Date());
    const reasonsByUser = await loadConstraintReasonsByUser(weekStart);
    const userStats = await userStatsForDepartment(departmentId, reasonsByUser);

    return mapDepartment(row, userStats);
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
    if (!row) return null;

    const weekStart = getWeekStartSundayInIsrael(new Date());
    const reasonsByUser = await loadConstraintReasonsByUser(weekStart);
    const userStats = await userStatsForDepartment(row.id, reasonsByUser);

    return mapDepartment(row, userStats);
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
