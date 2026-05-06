import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
import {
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  User as UserIcon,
  Users,
  X,
  Search,
} from "lucide-react";
import { AuthService } from "../services/auth.service";
import { LoadingSpinner, LoadingState } from "../components/ui/LoadingIndicator";
import { getRoleLabel, userRoleOptions } from "../utils/staffing";
import { getSeniorityLabel } from "../utils/userStatus";

interface UserData {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string | null;
  departments: DepartmentData[];
  seniority: SeniorityData | null;
  created_at?: string;
  updated_at?: string;
}

interface DepartmentData {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

interface SeniorityData {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
}

interface EditFormData {
  email: string;
  full_name: string;
  role: string;
  phone: string;
  department_ids: string[];
  seniority_id: string;
}

interface AddFormData extends EditFormData {
  password: string;
}

const API_BASE = "http://localhost:3000/api";

const formatRoleLabel = (role: string) => {
  return getRoleLabel(role);
};

const ROLE_COLORS: Record<string, string> = {
  admin: "#1d5c8b",
  doctor: "#0ea5e9",
  nurse: "#06b6d4",
  midwife: "#14b8a6",
  obgyn: "#8b5cf6",
  anesthesiologist: "#ec4899",
  orderly: "#f59e0b",
  pediatrician: "#10b981",
  shabbat_scribe: "#64748b",
  secretary: "#475569",
};

const defaultAddForm: AddFormData = {
  email: "",
  password: "",
  full_name: "",
  role: "midwife",
  phone: "",
  department_ids: [],
  seniority_id: "",
};

function isStaffRole(role: string) {
  return role !== "admin";
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;

  const data = error.response?.data;
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    return data.error;
  }

  return fallback;
}

function DepartmentChips({ departments }: { departments: DepartmentData[] }) {
  if (!departments.length) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {departments.map((department) => (
        <span
          key={department.id}
          className="inline-flex items-center rounded-full bg-[#ebf4fb] px-2 py-0.5 text-xs font-medium text-[#1d5c8b]"
        >
          {department.name}
        </span>
      ))}
    </div>
  );
}

export default function UserManagementPage() {
  const session = useMemo(() => AuthService.getSession(), []);
  const [users, setUsers] = useState<UserData[]>([]);
  const [departments, setDepartments] = useState<DepartmentData[]>([]);
  const [seniorities, setSeniorities] = useState<SeniorityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingUser, setAddingUser] = useState(false);
  const [editingUserSaving, setEditingUserSaving] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const [formData, setFormData] = useState(defaultAddForm);
  const [editForm, setEditForm] = useState<EditFormData>({
    email: "",
    full_name: "",
    role: "midwife",
    phone: "",
    department_ids: [],
    seniority_id: "",
  });

  const defaultDepartmentIds = useMemo(() => {
    const fallback = departments.find((department) => department.code === "default");
    return fallback ? [fallback.id] : departments.slice(0, 1).map((department) => department.id);
  }, [departments]);

  const defaultSeniorityId = useMemo(() => {
    const regular = seniorities.find((seniority) => seniority.code === "regular");
    return regular?.id ?? seniorities[0]?.id ?? "";
  }, [seniorities]);

  const fetchUsers = useCallback(async () => {
    if (!session) return;

    try {
      setLoading(true);
      const res = await axios.get<UserData[]>(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${session.jwtToken}` },
      });

      setUsers(
        res.data.map((user) => ({
          ...user,
          departments: user.departments ?? [],
          seniority: user.seniority ?? null,
        })),
      );
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  }, [session]);

  const fetchDepartments = useCallback(async () => {
    if (!session) return;

    try {
      const res = await axios.get<{ departments: DepartmentData[] }>(
        `${API_BASE}/departments`,
        {
          headers: { Authorization: `Bearer ${session.jwtToken}` },
        },
      );

      setDepartments(res.data.departments ?? []);
    } catch (error) {
      console.error("Error fetching departments:", error);
      setDepartments([]);
    }
  }, [session]);

  const fetchSeniorities = useCallback(async () => {
    if (!session) return;

    try {
      const res = await axios.get<{ seniorities: SeniorityData[] }>(
        `${API_BASE}/seniorities`,
        {
          headers: { Authorization: `Bearer ${session.jwtToken}` },
        },
      );

      setSeniorities((res.data.seniorities ?? []).filter((seniority) => seniority.isActive));
    } catch (error) {
      console.error("Error fetching seniorities:", error);
      setSeniorities([]);
    }
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUsers();
    void fetchDepartments();
    void fetchSeniorities();
  }, [fetchDepartments, fetchSeniorities, fetchUsers]);

  const analytics = useMemo(() => {
    const roleCounts = users.reduce<Record<string, number>>((acc, user) => {
      const roleKey = user.role.trim().toLowerCase();
      acc[roleKey] = (acc[roleKey] ?? 0) + 1;
      return acc;
    }, {});

    return {
      totalUsers: users.length,
      roleCounts,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const matchesRole = roleFilter === "all" || user.role === roleFilter;

      if (!normalizedSearch) {
        return matchesRole;
      }

      const searchableFields = [
        user.full_name,
        user.email,
        user.phone ?? "",
        user.id,
        getSeniorityLabel(user.seniority),
        user.seniority?.code ?? "",
        ...user.departments.map((department) => department.name),
      ];

      const matchesSearch = searchableFields.some((field) =>
        field.toLowerCase().includes(normalizedSearch),
      );

      return matchesRole && matchesSearch;
    });
  }, [roleFilter, searchTerm, users]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    try {
      setAddingUser(true);
      const payload = {
        ...formData,
        phone: formData.phone.trim() === "" ? null : formData.phone.trim(),
        department_ids: isStaffRole(formData.role) ? formData.department_ids : [],
        seniority_id: isStaffRole(formData.role) ? formData.seniority_id : null,
      };

      await axios.post(`${API_BASE}/users`, payload, {
        headers: { Authorization: `Bearer ${session.jwtToken}` },
      });

      setShowAddForm(false);
      setFormData({
        ...defaultAddForm,
        department_ids: defaultDepartmentIds,
        seniority_id: defaultSeniorityId,
      });
      setShowSuccessModal(true);
      void fetchUsers();
    } catch (error: unknown) {
      console.error("Error adding user:", error);
      const msg = getApiErrorMessage(error, "Failed to add user");
      alert(`Error: ${msg}`);
    } finally {
      setAddingUser(false);
    }
  };

  const openAddForm = () => {
    setFormData({
      ...defaultAddForm,
      department_ids: defaultDepartmentIds,
      seniority_id: defaultSeniorityId,
    });
    setShowAddForm(true);
  };

  const openEditModal = (user: UserData) => {
    setEditingUser(user);
    setEditForm({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      phone: user.phone ?? "",
      department_ids: user.departments.map((department) => department.id),
      seniority_id: user.seniority?.id ?? "",
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !editingUser) return;

    try {
      setEditingUserSaving(true);
      await axios.put(
        `${API_BASE}/users/${editingUser.id}`,
        {
          email: editForm.email,
          full_name: editForm.full_name,
          role: editForm.role,
          phone: editForm.phone.trim() === "" ? null : editForm.phone.trim(),
          department_ids: isStaffRole(editForm.role) ? editForm.department_ids : [],
          seniority_id: isStaffRole(editForm.role) ? editForm.seniority_id : null,
        },
        { headers: { Authorization: `Bearer ${session.jwtToken}` } },
      );

      setEditingUser(null);
      void fetchUsers();
    } catch (error: unknown) {
      console.error("Error updating user:", error);
      const msg = getApiErrorMessage(error, "Failed to update user");
      alert(`Error: ${msg}`);
    } finally {
      setEditingUserSaving(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!session || !userToDelete) return;

    try {
      setDeletingUser(true);
      await axios.delete(`${API_BASE}/users/${userToDelete.id}`, {
        headers: { Authorization: `Bearer ${session.jwtToken}` },
      });

      setUserToDelete(null);
      void fetchUsers();
    } catch (error: unknown) {
      console.error("Error deleting user:", error);
      const msg = getApiErrorMessage(error, "Failed to delete user");
      alert(`Error: ${msg}`);
    } finally {
      setDeletingUser(false);
    }
  };

  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "admin") return <Navigate to="/chat" replace />;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">ניהול משתמשים</h1>
            <p className="text-slate-500 mt-1">יצירה וניהול של משתמשי המערכת</p>
          </div>

          {!showAddForm && (
            <button
              onClick={openAddForm}
              className="flex items-center justify-center gap-2 bg-[#1d5c8b] text-white px-5 py-3 rounded-xl hover:bg-[#164e78] transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              הוסף משתמש חדש
            </button>
          )}
        </div>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-6 overflow-hidden">
          <button
            type="button"
            onClick={() => setStatsExpanded((p) => !p)}
            className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors cursor-pointer text-right"
            aria-expanded={statsExpanded}
            aria-label="הצג פירוט משתמשים"
          >
            <div className="flex items-center gap-3 shrink-0">
              <span className="w-11 h-11 rounded-xl bg-[#ebf4fb] text-[#1d5c8b] flex items-center justify-center">
                <Users className="w-5 h-5" />
              </span>
              <div>
                <p className="text-2xl font-bold text-slate-900 leading-none">
                  {analytics.totalUsers}
                </p>
                <p className="text-xs text-slate-500 mt-1">סה״כ משתמשים</p>
              </div>
            </div>

            <div className="flex-1 min-w-0 h-3 rounded-full overflow-hidden bg-slate-100 flex">
              {analytics.totalUsers > 0 ? (
                userRoleOptions.map((option) => {
                  const count = analytics.roleCounts[option.value] ?? 0;
                  if (count === 0) return null;
                  const pct = (count / analytics.totalUsers) * 100;
                  return (
                    <div
                      key={option.value}
                      style={{
                        width: `${pct}%`,
                        backgroundColor: ROLE_COLORS[option.value] ?? "#1d5c8b",
                      }}
                      title={`${option.pluralLabel}: ${count} (${Math.round(pct)}%)`}
                      className="transition-[width] duration-300"
                    />
                  );
                })
              ) : null}
            </div>

            <ChevronDown
              className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ${
                statsExpanded ? "rotate-180" : ""
              }`}
            />
          </button>

          <div
            className={`grid transition-all duration-300 ease-out ${
              statsExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden">
              <div className="border-t border-slate-100 p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {userRoleOptions.map((option) => {
                  const Icon = option.icon;
                  const count = analytics.roleCounts[option.value] ?? 0;
                  const pct =
                    analytics.totalUsers > 0
                      ? Math.round((count / analytics.totalUsers) * 100)
                      : 0;
                  const color = ROLE_COLORS[option.value] ?? "#1d5c8b";
                  const isEmpty = count === 0;
                  return (
                    <div
                      key={option.value}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-opacity ${
                        isEmpty
                          ? "border-slate-100 bg-slate-50/60 opacity-60"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <span
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: isEmpty ? "#f1f5f9" : `${color}1a`,
                          color: isEmpty ? "#94a3b8" : color,
                        }}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-slate-500 truncate leading-tight">
                          {option.pluralLabel}
                        </p>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className="text-lg font-bold text-slate-900 leading-none">
                            {count}
                          </span>
                          {!isEmpty && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              {pct}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

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
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1d5c8b]"
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
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1d5c8b]"
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
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1d5c8b]"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">תפקיד</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1d5c8b]"
                  value={formData.role}
                  onChange={(e) => {
                    const nextRole = e.target.value;
                    setFormData({
                      ...formData,
                      role: nextRole,
                      department_ids:
                        isStaffRole(nextRole) && formData.department_ids.length === 0
                          ? defaultDepartmentIds
                          : formData.department_ids,
                      seniority_id: isStaffRole(nextRole)
                        ? formData.seniority_id || defaultSeniorityId
                        : "",
                    });
                  }}
                >
                  {userRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">מחלקות</label>
                <select
                  required={isStaffRole(formData.role)}
                  disabled={!isStaffRole(formData.role)}
                  className="w-full h-10 bg-white px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1d5c8b] disabled:bg-slate-50 disabled:text-slate-400"
                  value={formData.department_ids[0] ?? ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      department_ids: e.target.value ? [e.target.value] : [],
                    })
                  }
                >
                  <option value="">בחר מחלקה</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">ותק</label>
                <select
                  required={isStaffRole(formData.role)}
                  disabled={!isStaffRole(formData.role)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1d5c8b] disabled:bg-slate-50 disabled:text-slate-400"
                  value={formData.seniority_id}
                  onChange={(e) =>
                    setFormData({ ...formData, seniority_id: e.target.value })
                  }
                >
                  <option value="">בחר ותק</option>
                  {seniorities.map((seniority) => (
                    <option key={seniority.id} value={seniority.id}>
                      {getSeniorityLabel(seniority)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">טלפון</label>
                <input
                  type="tel"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1d5c8b]"
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
                  disabled={addingUser}
                  className="px-5 py-2 bg-[#1d5c8b] text-white rounded-xl hover:bg-[#164e78] disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {addingUser ? <LoadingSpinner className="w-4 h-4" /> : null}
                  {addingUser ? "שומר משתמש..." : "שמור משתמש"}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/70">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="חיפוש לפי שם, אימייל, טלפון או מזהה"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pr-10 pl-3 py-2.5 text-sm focus:ring-2 focus:ring-[#1d5c8b]"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full sm:w-48 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#1d5c8b]"
                >
                  <option value="all">כל התפקידים</option>
                  {userRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.pluralLabel}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setRoleFilter("all");
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
                >
                  ניקוי
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-6 py-4 font-semibold">שם</th>
                  <th className="px-6 py-4 font-semibold">תפקיד</th>
                  <th className="px-6 py-4 font-semibold">ותק</th>
                  <th className="px-6 py-4 font-semibold">מחלקות</th>
                  <th className="px-6 py-4 font-semibold">טלפון</th>
                  <th className="px-6 py-4 font-semibold">אימייל</th>
                  <th className="px-6 py-4 font-semibold">פעולות</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-10 text-center text-slate-500"
                    >
                      <LoadingState label="טוען משתמשים..." className="p-0" />
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-10 text-center text-slate-500"
                    >
                      לא נמצאו משתמשים
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#ebf4fb] text-[#1d5c8b] rounded-full flex items-center justify-center">
                          <UserIcon className="w-4 h-4" />
                        </div>
                        {u.full_name}
                      </td>
                      <td className="px-6 py-4">{getRoleLabel(u.role)}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {getSeniorityLabel(u.seniority)}
                      </td>
                      <td className="px-6 py-4">
                        <DepartmentChips departments={u.departments} />
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {u.phone ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{u.email}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="p-2 rounded-lg text-orange-300 hover:bg-orange-50"
                            aria-label="Edit user"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setUserToDelete(u)}
                            className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"
                            aria-label="Delete user"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-slate-100">
            {loading ? (
              <LoadingState label="טוען משתמשים..." className="px-4 py-8" />
            ) : filteredUsers.length === 0 ? (
              <p className="px-4 py-8 text-center text-slate-500">לא נמצאו משתמשים</p>
            ) : (
              filteredUsers.map((u) => (
                <article key={u.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-[#ebf4fb] text-[#1d5c8b] rounded-full flex items-center justify-center shrink-0">
                        <UserIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{u.full_name}</p>
                        <p className="text-xs text-slate-500">
                          {formatRoleLabel(u.role)} · {getSeniorityLabel(u.seniority)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(u)}
                        className="p-2 rounded-lg text-orange-300 hover:bg-orange-50"
                        aria-label="Edit user"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserToDelete(u)}
                        className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"
                        aria-label="Delete user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-slate-600 space-y-1">
                    <DepartmentChips departments={u.departments} />
                    <p className="break-all">{u.email}</p>
                    <p>{u.phone ?? "—"}</p>
                    <p className="text-xs text-slate-400 font-mono break-all">{u.id}</p>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>

      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl relative">
            <button
              className="absolute left-4 top-4 text-slate-500"
              onClick={() => setShowSuccessModal(false)}
            >
              <X className="w-5 h-5" />
            </button>
            <div className="mx-auto w-20 h-20 rounded-full bg-[#ebf4fb] flex items-center justify-center animate-pulse">
              <Check className="w-10 h-10 text-[#1d5c8b]" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mt-4">
              המשתמש נוסף בהצלחה
            </h3>
            <p className="text-slate-500 mt-2">משתמש חדש נוצר ונשמר במערכת.</p>
            <button
              onClick={() => setShowSuccessModal(false)}
              className="mt-6 w-full bg-[#1d5c8b] hover:bg-[#164e78] text-white py-2 rounded-xl"
            >
              סגור
            </button>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-xl w-full shadow-2xl">
            <h3 className="text-xl font-semibold mb-5">עריכת משתמש</h3>
            <form
              onSubmit={handleEditSubmit}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1">שם מלא</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  value={editForm.full_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, full_name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">אימייל</label>
                <input
                  type="email"
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm({ ...editForm, email: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">תפקיד</label>
                <select
                  value={editForm.role}
                  onChange={(e) => {
                    const nextRole = e.target.value;
                    setEditForm({
                      ...editForm,
                      role: nextRole,
                      department_ids:
                        isStaffRole(nextRole) && editForm.department_ids.length === 0
                          ? defaultDepartmentIds
                          : editForm.department_ids,
                      seniority_id: isStaffRole(nextRole)
                        ? editForm.seniority_id || defaultSeniorityId
                        : "",
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                >
                  {userRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">מחלקות</label>
                <select
                  required={isStaffRole(editForm.role)}
                  disabled={!isStaffRole(editForm.role)}
                  className="w-full h-10 bg-white px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1d5c8b] disabled:bg-slate-50 disabled:text-slate-400"
                  value={editForm.department_ids[0] ?? ""}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      department_ids: e.target.value ? [e.target.value] : [],
                    })
                  }
                >
                  <option value="">בחר מחלקה</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ותק</label>
                <select
                  required={isStaffRole(editForm.role)}
                  disabled={!isStaffRole(editForm.role)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl disabled:bg-slate-50 disabled:text-slate-400"
                  value={editForm.seniority_id}
                  onChange={(e) =>
                    setEditForm({ ...editForm, seniority_id: e.target.value })
                  }
                >
                  <option value="">בחר ותק</option>
                  {seniorities.map((seniority) => (
                    <option key={seniority.id} value={seniority.id}>
                      {getSeniorityLabel(seniority)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">טלפון</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm({ ...editForm, phone: e.target.value })
                  }
                />
              </div>

              <div className="md:col-span-2 flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={editingUserSaving}
                  className="px-4 py-2 rounded-xl bg-[#1d5c8b] text-white disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {editingUserSaving ? <LoadingSpinner className="w-4 h-4" /> : null}
                  {editingUserSaving ? "שומר..." : "שמור שינויים"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {userToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-semibold text-slate-900">
              אישור מחיקה
            </h3>
            <p className="text-slate-600 mt-2">
              למחוק את המשתמש{" "}
              <span className="font-semibold">{userToDelete.full_name}</span>?
              פעולה זו אינה ניתנת לביטול.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                className="px-4 py-2 rounded-xl bg-slate-100"
                onClick={() => setUserToDelete(null)}
              >
                ביטול
              </button>
              <button
                className="px-4 py-2 rounded-xl bg-rose-600 text-white disabled:opacity-60 inline-flex items-center gap-2"
                disabled={deletingUser}
                onClick={() => void confirmDeleteUser()}
              >
                {deletingUser ? <LoadingSpinner className="w-4 h-4" /> : null}
                {deletingUser ? "מוחק..." : "מחק משתמש"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
