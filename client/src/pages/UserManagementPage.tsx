import { useCallback, useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
import { Plus, User as UserIcon, Users, Stethoscope } from "lucide-react";
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

const formatRoleLabel = (role: string) => {
  const roleMap: Record<string, string> = {
    admin: "מנהלים",
    doctor: "רופאים",
    nurse: "אחיות",
  };

  return roleMap[role] ?? role;
};

export default function UserManagementPage() {
  const session = useMemo(() => AuthService.getSession(), []);
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
    if (!session) {
      return;
    }

    try {
      setLoading(true);
      const res = await axios.get<UserData[]>(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${session.jwtToken}` },
      });

      setUsers(res.data);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  }, [session?.jwtToken]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const analytics = useMemo(() => {
    const roleCounts = users.reduce<Record<string, number>>((acc, user) => {
      const roleKey = user.role.trim().toLowerCase();
      acc[roleKey] = (acc[roleKey] ?? 0) + 1;
      return acc;
    }, {});

    return {
      totalUsers: users.length,
      doctors: roleCounts.doctor ?? 0,
      roleCounts,
    };
  }, [users]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session) {
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

      alert("User added successfully!");
      setShowAddForm(false);
      setFormData({
        email: "",
        password: "",
        full_name: "",
        role: "doctor",
        phone: "",
      });

      void fetchUsers();
    } catch (error: any) {
      console.error("Error adding user:", error);
      const msg = error.response?.data?.error || "Failed to add user";
      alert(`Error: ${msg}`);
    }
  };

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (session.user.role !== "admin") {
    return <Navigate to="/chat" replace />;
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">ניהול משתמשים</h1>
            <p className="text-slate-500 mt-1">יצירה וניהול של משתמשי המערכת</p>
          </div>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            {showAddForm ? "ביטול" : "הוסף משתמש חדש"}
          </button>
        </div>

        {/* Analytics */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <article className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">סה״כ משתמשים</p>
              <span className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </span>
            </div>
            <p className="text-3xl font-semibold text-slate-900 mt-3">{analytics.totalUsers}</p>
          </article>

          <article className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">רופאים</p>
              <span className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <Stethoscope className="w-5 h-5" />
              </span>
            </div>
            <p className="text-3xl font-semibold text-slate-900 mt-3">{analytics.doctors}</p>
          </article>

          {Object.entries(analytics.roleCounts)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([role, count]) => (
              <article
                key={role}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"
              >
                <p className="text-sm text-slate-500">{formatRoleLabel(role)}</p>
                <p className="text-3xl font-semibold text-slate-900 mt-3">{count}</p>
              </article>
            ))}
        </section>

        {/* Add Form */}
        {showAddForm && (
          <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 mb-10">
            <h2 className="text-xl font-semibold mb-6">הוספת משתמש חדש</h2>

            <form
              onSubmit={handleSubmit}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              <div>
                <label className="block text-sm font-medium mb-1">שם מלא</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  value={formData.full_name}
                  onChange={(e) =>
                    setFormData({ ...formData, full_name: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">אימייל</label>
                <input
                  type="email"
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">סיסמה</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">תפקיד</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                >
                  <option value="admin">Admin</option>
                  <option value="doctor">Doctor</option>
                  <option value="nurse">Nurse</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  טלפון (אופציונלי)
                </label>
                <input
                  type="tel"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                />
              </div>

              <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
                >
                  שמור משתמש
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-6 py-4 font-semibold">שם</th>
                  <th className="px-6 py-4 font-semibold">תפקיד</th>
                  <th className="px-6 py-4 font-semibold">טלפון</th>
                  <th className="px-6 py-4 font-semibold">אימייל</th>
                  <th className="px-6 py-4 font-semibold">ID</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-10 text-center text-slate-500"
                    >
                      טוען משתמשים...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-10 text-center text-slate-500"
                    >
                      לא נמצאו משתמשים
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium flex items-center gap-3">
                        <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                          <UserIcon className="w-4 h-4" />
                        </div>
                        {u.full_name}
                      </td>

                      <td className="px-6 py-4">{u.role}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {u.phone ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{u.email}</td>
                      <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                        {u.id}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
