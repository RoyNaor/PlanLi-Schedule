import { queryDatabase } from "./database.service.js";

interface SeniorityRow {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Seniority {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapSeniority(row: SeniorityRow): Seniority {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export const SeniorityService = {
  async listSeniorities(): Promise<Seniority[]> {
    const result = await queryDatabase<SeniorityRow>(
      `SELECT id::text AS id, code, name, sort_order, is_active, created_at, updated_at
       FROM seniorities
       ORDER BY is_active DESC, sort_order ASC, name ASC`,
    );

    return result.rows.map(mapSeniority);
  },

  async countExistingSeniorities(seniorityIds: string[]): Promise<number> {
    if (seniorityIds.length === 0) return 0;

    const result = await queryDatabase<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM seniorities
       WHERE id = ANY($1::uuid[])`,
      [seniorityIds],
    );

    return Number(result.rows[0]?.count ?? 0);
  },

  async getRegularSeniorityId(): Promise<string | null> {
    const result = await queryDatabase<{ id: string }>(
      `SELECT id::text AS id
       FROM seniorities
       WHERE code = 'regular'
       LIMIT 1`,
    );

    return result.rows[0]?.id ?? null;
  },
};
