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
import {
  DepartmentStatsChips,
  type DepartmentUserStatsData,
} from "../components/departments/DepartmentStatsChips";

interface DepartmentData {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  usersCount: number;
  userStats: DepartmentUserStatsData;
  requiredTotal?: number;
  requiredSenior?: number;
  requiredRegular?: number;
  requiredIntern?: number;
  createdAt: string;
  updatedAt: string;
}

function emptyDepartmentUserStats(totalUsers: number): DepartmentUserStatsData {
  return {
    total: totalUsers,
    byStatus: {
      active: totalUsers,
      sick: 0,
      course: 0,
      vacation: 0,
      leave: 0,
      other: 0,
    },
    bySeniority: { senior: 0, regular: 0, intern: 0, none: 0 },
    byRole: {},
  };
}

interface DepartmentFormData {
  name: string;
  code: string;
  isActive: boolean;
  requiredTotal: number;
  requiredSenior: number;
  requiredRegular: number;
  requiredIntern: number;
}

const API_BASE = "http://localhost:3000/api";

const emptyForm: DepartmentFormData = {
  name: "",
  code: "",
  isActive: true,
  requiredTotal: 0,
  requiredSenior: 0,
  requiredRegular: 0,
  requiredIntern: 0,
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

function RequirementsSummary({ department }: { department: DepartmentData }) {
  const requiredTotal = department.requiredTotal ?? 0;
  const requiredSenior = department.requiredSenior ?? 0;
  const requiredRegular = department.requiredRegular ?? 0;
  const requiredIntern = department.requiredIntern ?? 0;

  if (requiredTotal === 0 && requiredSenior === 0 && requiredRegular === 0 && requiredIntern === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
        סה״כ: {requiredTotal}
      </span>
      <span className="inline-flex items-center rounded-full bg-[#ebf4fb] px-2 py-0.5 text-xs font-semibold text-[#1d5c8b]">
        בכירים: {requiredSenior}
      </span>
      <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
        רגילים: {requiredRegular}
      </span>
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
        מתמחים: {requiredIntern}
      </span>
    </div>
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
      const raw = res.data.departments ?? [];
      setDepartments(
        raw.map((d) => ({
          ...d,
          userStats:
            d.userStats ??
            emptyDepartmentUserStats(typeof d.usersCount === "number" ? d.usersCount : 0),
        })),
      );
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
      requiredTotal: department.requiredTotal ?? 0,
      requiredSenior: department.requiredSenior ?? 0,
      requiredRegular: department.requiredRegular ?? 0,
      requiredIntern: department.requiredIntern ?? 0,
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
      required_total: Math.max(0, Number(formData.requiredTotal) || 0),
      required_senior: Math.max(0, Number(formData.requiredSenior) || 0),
      required_regular: Math.max(0, Number(formData.requiredRegular) || 0),
      required_intern: Math.max(0, Number(formData.requiredIntern) || 0),
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

              <div className="md:col-span-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-sm font-semibold text-slate-900">דרישות כוח אדם</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  אפשר לשמור גם אם אין התאמה מלאה — תקבלו אזהרה בחדר הבקרה.
                </p>

                {formData.requiredSenior + formData.requiredRegular + formData.requiredIntern !==
                formData.requiredTotal ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    שים לב: סכום בכירים/רגילים/מתמחים אינו שווה לסה״כ.
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600">סה״כ</span>
                    <input
                      type="number"
                      min={0}
                      value={formData.requiredTotal}
                      onChange={(e) =>
                        setFormData((cur) => ({ ...cur, requiredTotal: Number(e.target.value) }))
                      }
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:ring-2 focus:ring-[#1d5c8b]"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600">בכירים</span>
                    <input
                      type="number"
                      min={0}
                      value={formData.requiredSenior}
                      onChange={(e) =>
                        setFormData((cur) => ({ ...cur, requiredSenior: Number(e.target.value) }))
                      }
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:ring-2 focus:ring-[#1d5c8b]"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600">רגילים</span>
                    <input
                      type="number"
                      min={0}
                      value={formData.requiredRegular}
                      onChange={(e) =>
                        setFormData((cur) => ({ ...cur, requiredRegular: Number(e.target.value) }))
                      }
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:ring-2 focus:ring-[#1d5c8b]"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600">מתמחים</span>
                    <input
                      type="number"
                      min={0}
                      value={formData.requiredIntern}
                      onChange={(e) =>
                        setFormData((cur) => ({ ...cur, requiredIntern: Number(e.target.value) }))
                      }
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:ring-2 focus:ring-[#1d5c8b]"
                    />
                  </label>
                </div>
              </div>

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
                  <th className="px-6 py-4 font-semibold">דרישות</th>
                  <th className="px-6 py-4 font-semibold">סטטוס</th>
                  <th className="px-6 py-4 font-semibold">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                      <LoadingState label="טוען מחלקות..." className="p-0" />
                    </td>
                  </tr>
                ) : filteredDepartments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                      אין מחלקות להצגה
                    </td>
                  </tr>
                ) : (
                  filteredDepartments.map((department) => (
                    <tr key={department.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 align-top">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-3">
                            <span className="w-9 h-9 rounded-xl bg-[#ebf4fb] text-[#1d5c8b] flex items-center justify-center shrink-0">
                              <Building2 className="w-4 h-4" />
                            </span>
                            <span className="font-semibold text-slate-900">{department.name}</span>
                          </div>
                          <DepartmentStatsChips stats={department.userStats} />
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
                        <RequirementsSummary department={department} />
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
                        <DepartmentStatsChips stats={department.userStats} />
                      </div>
                    </div>
                    <DepartmentStatusChip isActive={department.isActive} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                      <Users className="w-4 h-4 text-slate-400" />
                      {department.usersCount}
                    </span>
                    <div className="text-xs text-slate-500">
                      <RequirementsSummary department={department} />
                    </div>
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
