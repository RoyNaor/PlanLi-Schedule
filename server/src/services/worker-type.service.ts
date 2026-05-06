import { createHash } from "crypto";
import { queryDatabase } from "./database.service.js";

interface WorkerTypeRow {
  id: string;
  code: string;
  name: string;
  source: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface WorkerType {
  id: string;
  code: string;
  name: string;
  source: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapWorkerType(row: WorkerTypeRow): WorkerType {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    source: row.source,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function normalizeWorkerTypeCode(name: string): string {
  const trimmed = name.trim();
  const ascii = trimmed
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "")
    .replace(/^_+|_+$/g, "");

  if (ascii) return ascii.slice(0, 100);

  const hash = createHash("sha1").update(trimmed).digest("hex").slice(0, 12);
  return `excel_${hash}`;
}

export const WorkerTypeService = {
  async listWorkerTypes(includeInactive = false): Promise<WorkerType[]> {
    const result = await queryDatabase<WorkerTypeRow>(
      `SELECT id::text AS id,
              code,
              name,
              source,
              is_active,
              created_at,
              updated_at
       FROM worker_types
       WHERE $1::boolean OR is_active = TRUE
       ORDER BY is_active DESC, name ASC`,
      [includeInactive],
    );

    return result.rows.map(mapWorkerType);
  },

  async getWorkerTypeById(workerTypeId: string): Promise<WorkerType | null> {
    const result = await queryDatabase<WorkerTypeRow>(
      `SELECT id::text AS id,
              code,
              name,
              source,
              is_active,
              created_at,
              updated_at
       FROM worker_types
       WHERE id = $1`,
      [workerTypeId],
    );

    const row = result.rows[0];
    return row ? mapWorkerType(row) : null;
  },

  async countExistingWorkerTypes(workerTypeIds: string[]): Promise<number> {
    if (workerTypeIds.length === 0) return 0;

    const result = await queryDatabase<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM worker_types
       WHERE id = ANY($1::uuid[])`,
      [workerTypeIds],
    );

    return Number(result.rows[0]?.count ?? 0);
  },

  async upsertWorkerType(input: {
    name: string;
    code?: string;
    source?: string;
    isActive?: boolean;
  }): Promise<WorkerType> {
    const name = input.name.trim();
    if (!name) {
      throw new Error("worker type name is required");
    }

    const code = (input.code?.trim() || normalizeWorkerTypeCode(name)).slice(0, 120);
    const source = input.source?.trim() || "manual";
    const isActive = input.isActive ?? true;

    const result = await queryDatabase<WorkerTypeRow>(
      `INSERT INTO worker_types (code, name, source, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           source = EXCLUDED.source,
           is_active = EXCLUDED.is_active,
           updated_at = NOW()
       RETURNING id::text AS id,
                 code,
                 name,
                 source,
                 is_active,
                 created_at,
                 updated_at`,
      [code, name, source, isActive],
    );

    return mapWorkerType(result.rows[0] as WorkerTypeRow);
  },

  async updateWorkerType(input: {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
  }): Promise<WorkerType | null> {
    const result = await queryDatabase<WorkerTypeRow>(
      `UPDATE worker_types
       SET name = $2,
           code = $3,
           is_active = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id::text AS id,
                 code,
                 name,
                 source,
                 is_active,
                 created_at,
                 updated_at`,
      [input.id, input.name.trim(), input.code.trim(), input.isActive],
    );

    const row = result.rows[0];
    return row ? mapWorkerType(row) : null;
  },
};
