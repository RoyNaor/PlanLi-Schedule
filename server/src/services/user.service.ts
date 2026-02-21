import { queryDatabase } from "./database.service.js";

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

  async getUserByEmail(email: string): Promise<UserProfile | null> {
    const result = await queryDatabase<UserRow>(
      `SELECT id, email, full_name, role, phone, created_at, updated_at
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email],
    );

    const row = result.rows[0];
    return row ? mapUser(row) : null;
  },

  async getUserByIdOrEmail(userId: string, email: string): Promise<UserProfile | null> {
    const byId = await this.getUserById(userId);

    if (byId) {
      return byId;
    }

    return this.getUserByEmail(email);
  },
};
