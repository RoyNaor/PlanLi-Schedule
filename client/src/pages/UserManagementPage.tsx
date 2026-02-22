import axios from "axios";
import { Plus, User as UserIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AuthService } from "../services/auth.service";

interface UserData {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string | null;
  created_at?: string;
  updated_at?: string;
}

const API_BASE = "http://localhost:3000/api";

export default function UserManagementPage() {
  const session = AuthService.getSession();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "doctor",
    phone: "",
  });

  const fetchUsers = useCallback(async () => {
    if (!session?.jwtToken) return;

    try {
      setLoading(true);
      const res = await axios.get<UserData[]>(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${session.jwtToken}` },
      });
      setUsers(res.data);
    } catch (error) {
      console.error("Error fetching users:", error);
      alert("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [session?.jwtToken]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session?.jwtToken) {
      alert("Missing session");
      return;
    }

    try {
      const payload = {
        ...formData,
        phone: formData.phone.trim() === "" ? null : formData.phone.trim(),
      };

      await axios.post(`${API_BASE}/users`, payload, {
        headers: { Authorization: `Bearer ${session.jwtToken}` },
      });

      alert("User added successfully");
      setShowAddForm(false);
      setFormData({
        email: "",
        password: "",
        full_name: "",
        role: "doctor",
        phone: "",
      });
      void fetchUsers();
    } catch (error) {
      console.error("Error adding user:", error);
      if (axios.isAxiosError(error)) {
        alert(error.response?.data?.error ?? "Failed to add user");
      } else {
        alert("Failed to add user");
      }
    }
  };

  if (session?.user.role !== "admin") {
    return <p className="access-denied">Only admins can access this page.</p>;
  }

  return (
    <div className="users-shell">
      <div className="users-header">
        <div>
          <h1>User Management</h1>
          <p>Create Admin, Doctor, and Nurse accounts.</p>
        </div>
        <button type="button" className="primary-btn" onClick={() => setShowAddForm((prev) => !prev)}>
          <Plus size={16} /> Add New User
        </button>
      </div>

      {showAddForm ? (
        <form className="users-form" onSubmit={handleSubmit}>
          <label>
            Full Name
            <input
              required
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              required
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </label>
          <label>
            Password
            <input
              required
              minLength={6}
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </label>
          <label>
            Role
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="admin">Admin</option>
              <option value="doctor">Doctor</option>
              <option value="nurse">Nurse</option>
            </select>
          </label>
          <label>
            Phone (Optional)
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </label>
          <div className="users-form-actions">
            <button type="button" className="ghost-btn" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
            <button type="submit" className="primary-btn">
              Save User
            </button>
          </div>
        </form>
      ) : null}

      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Firebase UID</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>Loading users...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7}>No users found.</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="user-name-cell">
                    <span className="user-icon">
                      <UserIcon size={14} />
                    </span>
                    {u.full_name}
                  </td>
                  <td>{u.role}</td>
                  <td>{u.phone ?? "—"}</td>
                  <td>{u.email}</td>
                  <td>{u.created_at ? new Date(u.created_at).toLocaleString() : "—"}</td>
                  <td>{u.updated_at ? new Date(u.updated_at).toLocaleString() : "—"}</td>
                  <td className="mono-cell">{u.id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
