import { queryDatabase } from "./database.service.js";

interface UpsertUserInput {
  id: string;
  email: string;
  fullName: string;
  role?: string;
  phone?: string;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
}

function mapUser(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    phone: row.phone,
  };
}

export const UserService = {
  async upsertUser(input: UpsertUserInput): Promise<UserProfile> {
    const result = await queryDatabase<UserRow>(
      `INSERT INTO users (id, email, full_name, role, phone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id)
       DO UPDATE SET
         email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         phone = EXCLUDED.phone,
         updated_at = NOW()
       RETURNING id, email, full_name, role, phone, created_at, updated_at`,
      [input.id, input.email, input.fullName, input.role ?? "staff", input.phone ?? null],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("Failed to create or update user");
    }

    return mapUser(row);
  },

  async getUserById(userId: string): Promise<UserProfile | null> {
    const result = await queryDatabase<UserRow>(
      `SELECT id, email, full_name, role, phone, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [userId],
    );

    const row = result.rows[0];
    return row ? mapUser(row) : null;
  },
};
