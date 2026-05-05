import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
import {
  Building2,
  Check,
  CircleSlash2,
  Pencil,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { AuthService } from "../services/auth.service";
import { LoadingSpinner, LoadingState } from "../components/ui/LoadingIndicator";

interface DepartmentData {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  usersCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DepartmentFormData {
  name: string;
  code: string;
  isActive: boolean;
}

const API_BASE = "http://localhost:3000/api";

const emptyForm: DepartmentFormData = {
  name: "",
  code: "",
  isActive: true,
};

function normalizeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;

  const data = error.response?.data;
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    return data.error;
  }

  return fallback;
}

function DepartmentStatusChip({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
        isActive ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {isActive ? <Check className="w-3 h-3" /> : <CircleSlash2 className="w-3 h-3" />}
      {isActive ? "פעילה" : "לא פעילה"}
    </span>
  );
}

export default function DepartmentManagementPage() {
  const session = useMemo(() => AuthService.getSession(), []);
  const [departments, setDepartments] = useState<DepartmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<DepartmentData | null>(null);
  const [formData, setFormData] = useState<DepartmentFormData>(emptyForm);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [error, setError] = useState("");

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${session?.jwtToken ?? ""}` }),
    [session?.jwtToken],
  );

  const fetchDepartments = useCallback(async () => {
    if (!session) return;

    try {
      setLoading(true);
      setError("");
      const res = await axios.get<{ departments: DepartmentData[] }>(
        `${API_BASE}/departments`,
        { headers: authHeaders },
      );
      setDepartments(res.data.departments ?? []);
    } catch (requestError: unknown) {
      console.error("Error fetching departments:", requestError);
      setError(getApiErrorMessage(requestError, "שגיאה בטעינת המחלקות"));
    } finally {
      setLoading(false);
    }
  }, [authHeaders, session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchDepartments();
  }, [fetchDepartments]);

  const filteredDepartments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return departments.filter((department) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && department.isActive) ||
        (statusFilter === "inactive" && !department.isActive);

      if (!matchesStatus) return false;
      if (!normalizedSearch) return true;

      return [department.name, department.code].some((field) =>
        field.toLowerCase().includes(normalizedSearch),
      );
    });
  }, [departments, searchTerm, statusFilter]);

  const totals = useMemo(
    () => ({
      total: departments.length,
      active: departments.filter((department) => department.isActive).length,
      assignedUsers: departments.reduce((sum, department) => sum + department.usersCount, 0),
    }),
    [departments],
  );

  const openCreateForm = () => {
    setEditingDepartment(null);
    setFormData(emptyForm);
    setFormOpen(true);
  };

  const openEditForm = (department: DepartmentData) => {
    setEditingDepartment(department);
    setFormData({
      name: department.name,
      code: department.code,
      isActive: department.isActive,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingDepartment(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session) return;

    const payload = {
      name: formData.name.trim(),
      code: normalizeCode(formData.code),
      is_active: formData.isActive,
    };

    try {
      setSaving(true);
      setError("");

      if (editingDepartment) {
        await axios.put(
          `${API_BASE}/departments/${editingDepartment.id}`,
          payload,
          { headers: authHeaders },
        );
      } else {
        await axios.post(`${API_BASE}/departments`, payload, { headers: authHeaders });
      }

      closeForm();
      await fetchDepartments();
    } catch (requestError: unknown) {
      console.error("Error saving department:", requestError);
      setError(getApiErrorMessage(requestError, "שגיאה בשמירת המחלקה"));
    } finally {
      setSaving(false);
    }
  };

  const toggleDepartmentStatus = async (department: DepartmentData) => {
    if (!session) return;

    try {
      setError("");
      await axios.put(
        `${API_BASE}/departments/${department.id}`,
        {
          name: department.name,
          code: department.code,
          is_active: !department.isActive,
        },
        { headers: authHeaders },
      );
      await fetchDepartments();
    } catch (requestError: unknown) {
      console.error("Error toggling department:", requestError);
      setError(getApiErrorMessage(requestError, "שגיאה בעדכון סטטוס המחלקה"));
    }
  };

  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "admin") return <Navigate to="/chat" replace />;

  return (
    <div dir="rtl" className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">ניהול מחלקות</h1>
            <p className="text-slate-500 mt-1">מחלקות בית החולים ושיוך צוותים.</p>
          </div>

          <button
            type="button"
            onClick={openCreateForm}
            className="flex items-center justify-center gap-2 bg-[#1d5c8b] text-white px-5 py-3 rounded-xl hover:bg-[#164e78] transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            הוסף מחלקה
          </button>
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">מחלקות</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totals.total}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">פעילות</p>
            <p className="text-2xl font-bold text-teal-700 mt-1">{totals.active}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">שיוכי משתמשים</p>
            <p className="text-2xl font-bold text-[#1d5c8b] mt-1">{totals.assignedUsers}</p>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {formOpen ? (
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 mb-5">
              <h2 className="text-xl font-semibold text-slate-900">
                {editingDepartment ? "עריכת מחלקה" : "הוספת מחלקה"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center"
                aria-label="סגור"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">שם מחלקה</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, name: event.target.value }))
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1d5c8b]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">קוד</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      code: normalizeCode(event.target.value),
                    }))
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1d5c8b] font-mono text-left"
                  dir="ltr"
                />
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-[#1d5c8b]"
                />
                <span className="text-sm font-medium text-slate-700">מחלקה פעילה</span>
              </label>

              <div className="md:col-span-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-5 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-[#1d5c8b] text-white hover:bg-[#164e78] disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {saving ? <LoadingSpinner className="w-4 h-4" /> : null}
                  {saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/70">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="חיפוש לפי שם או קוד"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pr-10 pl-3 py-2.5 text-sm focus:ring-2 focus:ring-[#1d5c8b]"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "all" | "active" | "inactive")
                }
                className="w-full sm:w-48 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#1d5c8b]"
              >
                <option value="all">כל הסטטוסים</option>
                <option value="active">פעילות</option>
                <option value="inactive">לא פעילות</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-6 py-4 font-semibold">מחלקה</th>
                  <th className="px-6 py-4 font-semibold">קוד</th>
                  <th className="px-6 py-4 font-semibold">משתמשים</th>
                  <th className="px-6 py-4 font-semibold">סטטוס</th>
                  <th className="px-6 py-4 font-semibold">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                      <LoadingState label="טוען מחלקות..." className="p-0" />
                    </td>
                  </tr>
                ) : filteredDepartments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                      אין מחלקות להצגה
                    </td>
                  </tr>
                ) : (
                  filteredDepartments.map((department) => (
                    <tr key={department.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-xl bg-[#ebf4fb] text-[#1d5c8b] flex items-center justify-center">
                            <Building2 className="w-4 h-4" />
                          </span>
                          <span className="font-semibold text-slate-900">{department.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-left font-mono text-slate-500" dir="ltr">
                        {department.code}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 text-slate-600">
                          <Users className="w-4 h-4 text-slate-400" />
                          {department.usersCount}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <DepartmentStatusChip isActive={department.isActive} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(department)}
                            className="p-2 rounded-lg text-orange-400 hover:bg-orange-50"
                            aria-label="ערוך מחלקה"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleDepartmentStatus(department)}
                            className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium"
                          >
                            {department.isActive ? "השבת" : "הפעל"}
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
              <LoadingState label="טוען מחלקות..." className="px-4 py-8" />
            ) : filteredDepartments.length === 0 ? (
              <p className="px-4 py-8 text-center text-slate-500">אין מחלקות להצגה</p>
            ) : (
              filteredDepartments.map((department) => (
                <article key={department.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-[#ebf4fb] text-[#1d5c8b] flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{department.name}</p>
                        <p className="text-xs text-slate-500 font-mono" dir="ltr">
                          {department.code}
                        </p>
                      </div>
                    </div>
                    <DepartmentStatusChip isActive={department.isActive} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                      <Users className="w-4 h-4 text-slate-400" />
                      {department.usersCount}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(department)}
                        className="p-2 rounded-lg text-orange-400 hover:bg-orange-50"
                        aria-label="ערוך מחלקה"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleDepartmentStatus(department)}
                        className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium"
                      >
                        {department.isActive ? "השבת" : "הפעל"}
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
