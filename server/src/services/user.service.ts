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

interface CreateUserInput {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
}

interface UpdateUserInput {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
}

// Maps raw DB column names to the API-friendly user profile shape.
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
  // Fetches a user profile using the primary key identifier.
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

  // Finds a user by case-insensitive email address for auth compatibility.
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

  // Resolves a user by id first, then falls back to email if needed.
  async getUserByIdOrEmail(userId: string, email: string): Promise<UserProfile | null> {
    const byId = await this.getUserById(userId);

    if (byId) {
      return byId;
    }

    return this.getUserByEmail(email);
  },

  // Returns all users for administrative management screens.
  async listUsers(): Promise<UserRow[]> {
    const result = await queryDatabase<UserRow>(
      `SELECT id, email, full_name, role, phone, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`,
    );

    return result.rows;
  },

  // Persists a provisioned user record linked to Firebase UID.
  async createUser(input: CreateUserInput): Promise<UserRow> {
    const result = await queryDatabase<UserRow>(
      `INSERT INTO users (id, email, full_name, role, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, role, phone, created_at, updated_at`,
      [input.id, input.email, input.fullName, input.role, input.phone],
    );

    return result.rows[0] as UserRow;
  },

  // Updates an existing user profile by id.
  async updateUser(input: UpdateUserInput): Promise<UserRow | null> {
    const result = await queryDatabase<UserRow>(
      `UPDATE users
       SET email = $2,
           full_name = $3,
           role = $4,
           phone = $5,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, full_name, role, phone, created_at, updated_at`,
      [input.id, input.email, input.fullName, input.role, input.phone],
    );

    return result.rows[0] ?? null;
  },

  // Deletes a user profile by id.
  async deleteUser(userId: string): Promise<boolean> {
    const result = await queryDatabase<{ id: string }>(
      `DELETE FROM users WHERE id = $1 RETURNING id`,
      [userId],
    );

    return result.rows.length > 0;
  },
};
