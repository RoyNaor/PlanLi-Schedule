import { createHash } from "crypto";
import fs from "fs/promises";
import type { PoolClient } from "pg";
import * as XLSX from "xlsx";
import { withDatabaseTransaction } from "./database.service.js";
import { normalizeMonthStart } from "./monthly-schedule.service.js";
import { normalizeWorkerTypeCode } from "./worker-type.service.js";

type Queryable = Pick<PoolClient, "query">;

const FINAL_SCHEDULE_SHEET_LABEL = "לוח חודשי סופי";
const JERUSALEM_OFFSET = "+03:00";

interface ImportWorker {
  userId: string;
  workerName: string;
  workerTypeId: string;
  workerTypeCode: string;
  workerTypeName: string;
}

interface WorkerColumn extends ImportWorker {
  sheetName: string;
  columnIndex: number;
}

interface ImportCounters {
  workerTypes: Set<string>;
  workers: Set<string>;
  states: number;
  departments: Set<string>;
  arrangements: Set<string>;
  shifts: number;
  assignments: number;
}

export interface ExcelMonthImportResult {
  monthStart: string;
  sheetsRead: string[];
  workerTypesImported: number;
  workersImported: number;
  workerStatesImported: number;
  departmentsImported: number;
  arrangementsImported: number;
  shiftsImported: number;
  assignmentsImported: number;
}

function hashText(input: string, length = 12): string {
  return createHash("sha1").update(input.trim()).digest("hex").slice(0, length);
}

function normalizeCode(input: string, prefix: string): string {
  const ascii = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "")
    .replace(/^_+|_+$/g, "");

  return ascii ? ascii.slice(0, 100) : `${prefix}_${hashText(input)}`;
}

function normalizeNameKey(input: string): string {
  return input.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return dateObjectToIsoDate(value);
  return normalizeNameKey(String(value));
}

function dateObjectToIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCell(sheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number): XLSX.CellObject | undefined {
  return sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] as XLSX.CellObject | undefined;
}

function getCellText(sheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number): string {
  return cellText(getCell(sheet, rowIndex, columnIndex)?.v);
}

function getMergedText(sheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number): string {
  const direct = getCellText(sheet, rowIndex, columnIndex);
  if (direct) return direct;

  for (const merge of sheet["!merges"] ?? []) {
    if (
      rowIndex >= merge.s.r &&
      rowIndex <= merge.e.r &&
      columnIndex >= merge.s.c &&
      columnIndex <= merge.e.c
    ) {
      return getCellText(sheet, merge.s.r, merge.s.c);
    }
  }

  return "";
}

function getFillRgb(cell: XLSX.CellObject | undefined): string {
  const style = (cell as unknown as {
    s?: {
      fgColor?: { rgb?: string };
      fill?: { fgColor?: { rgb?: string }; patternType?: string };
      patternType?: string;
    };
  } | undefined)?.s;

  return (style?.fgColor?.rgb ?? style?.fill?.fgColor?.rgb ?? "").toUpperCase();
}

function rgbParts(rgb: string): [number, number, number] | null {
  if (!rgb || rgb.length < 6) return null;
  const hex = rgb.slice(-6);
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  if ([red, green, blue].some((part) => Number.isNaN(part))) return null;
  return [red, green, blue];
}

function isRedFill(rgb: string): boolean {
  const parts = rgbParts(rgb);
  if (!parts) return false;
  const [red, green, blue] = parts;
  return red >= 180 && green <= 120 && blue <= 120;
}

function isPurpleFill(rgb: string): boolean {
  const parts = rgbParts(rgb);
  if (!parts) return false;
  const [red, green, blue] = parts;
  return red >= 130 && blue >= 130 && green <= 210;
}

function isSignificantFill(rgb: string): boolean {
  return isRedFill(rgb) || isPurpleFill(rgb);
}

function isWorkerTypeLabel(value: string): boolean {
  if (!value || value.length > 28) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const blocked = [
    "תאריך",
    "יום",
    "מחלק",
    "חדר",
    "מיון",
    "מערך",
    "מרפ",
    "הריון",
    "אולטרא",
    "חופשה",
    "מנהל",
    "סגן",
    "תורן",
    "אחראי",
  ];
  return !blocked.some((part) => value.includes(part));
}

function isWorkerName(value: string): boolean {
  if (!value || value.length > 44) return false;
  const blocked = [
    "תאריך",
    "יום בשבוע",
    "אחראי",
    "בכיר",
    "מתמחה",
    "מרפאה",
    "מחלקה",
    "חדר לידה",
    "מיון",
  ];
  return !blocked.some((part) => value.includes(part));
}

function isScheduleDepartmentLabel(value: string): boolean {
  if (!value || value.length > 48) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const blocked = ["תאריך", "יום בשבוע", "חופשה/מילואים/מחלה/כנס"];
  return !blocked.some((part) => value.includes(part));
}

function legacyRoleForWorkerType(workerTypeName: string): string {
  if (workerTypeName.includes("מייל")) return "midwife";
  if (workerTypeName.includes("הרדמה")) return "anesthesiologist";
  if (workerTypeName.toLowerCase().includes("gyn")) return "obgyn";
  return "doctor";
}

function dateToIsoDate(value: unknown): string {
  if (value instanceof Date) return dateObjectToIsoDate(value);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const month = String(parsed.m).padStart(2, "0");
      const day = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${month}-${day}`;
    }
  }

  const text = cellText(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return "";
}

function nextMonthStart(monthStart: string): string {
  const date = new Date(`${monthStart}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function dateForSheetRow(sheet: XLSX.WorkSheet, rowIndex: number, monthStart: string): string {
  const raw = getCell(sheet, rowIndex, 0)?.v;
  const directDate = dateToIsoDate(raw);
  if (directDate) return directDate;

  const dayNumber = Number(raw);
  if (!Number.isInteger(dayNumber) || dayNumber <= 0 || dayNumber > 31) return "";
  const candidate = `${monthStart.slice(0, 8)}${String(dayNumber).padStart(2, "0")}`;
  return candidate >= monthStart && candidate < nextMonthStart(monthStart) ? candidate : "";
}

function nextDayIso(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function fullDayStart(dateIso: string): string {
  return `${dateIso}T00:00:00${JERUSALEM_OFFSET}`;
}

function fullDayEnd(dateIso: string): string {
  return `${nextDayIso(dateIso)}T00:00:00${JERUSALEM_OFFSET}`;
}

function classifyState(text: string, fillRgb: string): {
  stateType: string;
  priority: "HARD" | "SOFT";
} {
  const normalized = text.toLowerCase();
  const softKeywords = [
    "מבקש",
    "מבקשת",
    "אם אפשר",
    "מעדיף",
    "מעדיפה",
    "חליפי",
    "חופש מבוקש",
    "בקשה",
  ];

  if (softKeywords.some((keyword) => normalized.includes(keyword))) {
    return { stateType: "vacation_request", priority: "SOFT" };
  }
  if (normalized.includes("קופח") || normalized.includes("קופה")) {
    return { stateType: "clinic", priority: "HARD" };
  }
  if (normalized.includes("קורס")) {
    return { stateType: "course", priority: "HARD" };
  }
  if (normalized.includes("מילואים")) {
    return { stateType: "military", priority: "HARD" };
  }
  if (normalized.includes("מחלה")) {
    return { stateType: "sick", priority: "HARD" };
  }
  if (normalized.includes("כנס")) {
    return { stateType: "conference", priority: "HARD" };
  }
  if (normalized.includes("אחרי תורנות") || normalized.includes("תורנות ב")) {
    return { stateType: "after_shift", priority: "HARD" };
  }
  if (normalized.includes("חופש מאושר") || isRedFill(fillRgb)) {
    return { stateType: "vacation", priority: "HARD" };
  }
  if (isPurpleFill(fillRgb)) {
    return text
      ? { stateType: "vacation_request", priority: "SOFT" }
      : { stateType: "vacation", priority: "HARD" };
  }

  return { stateType: "note", priority: "SOFT" };
}

function splitAssignedNames(raw: string, knownNames: Set<string>): string[] {
  const cleaned = normalizeNameKey(raw)
    .replace(/\*/g, "")
    .replace(/\b\d{1,2}\s*[-:]\s*\d{1,2}\b/g, "")
    .trim();
  if (!cleaned) return [];
  if (knownNames.has(cleaned)) return [cleaned];

  const namesFound = Array.from(knownNames)
    .filter((name) => name && cleaned.includes(name))
    .sort((a, b) => b.length - a.length);
  if (namesFound.length > 0) {
    return Array.from(new Set(namesFound));
  }

  const delimiterParts = cleaned
    .split(/[\/,+،]/)
    .map(normalizeNameKey)
    .filter(Boolean);
  if (delimiterParts.length > 1) return delimiterParts;

  return [cleaned];
}

function monthTag(monthStart: string): string {
  return `${monthStart.slice(5, 7)}.${monthStart.slice(2, 4)}`;
}

function findSheetName(workbook: XLSX.WorkBook, label: string): string | null {
  const normalizedLabel = label.trim();
  return workbook.SheetNames.find((sheetName) => sheetName.trim() === normalizedLabel) ?? null;
}

function sourceSheetNames(workbook: XLSX.WorkBook, monthStart: string): string[] {
  const names: string[] = [];
  const tag = monthTag(monthStart);

  const constraintsSheet =
    workbook.SheetNames.find((name) => name.includes("אילוצים") && name.includes(tag))
    ?? workbook.SheetNames.find((name) => name.includes("אילוצים"));
  if (constraintsSheet) names.push(constraintsSheet);

  const assignmentSourceSheet = findSheetName(workbook, "תורנויות לשיבוץ");
  if (assignmentSourceSheet) names.push(assignmentSourceSheet);

  const finalSheet = findSheetName(workbook, FINAL_SCHEDULE_SHEET_LABEL);
  if (finalSheet) names.push(finalSheet);

  return Array.from(new Set(names));
}

async function ensureWorkerType(
  client: Queryable,
  name: string,
  counters: ImportCounters,
): Promise<{ id: string; code: string; name: string }> {
  const workerTypeName = normalizeNameKey(name);
  const code = normalizeWorkerTypeCode(workerTypeName);
  const result = await client.query<{ id: string; code: string; name: string }>(
    `INSERT INTO worker_types (code, name, source, is_active)
     VALUES ($1, $2, 'excel', TRUE)
     ON CONFLICT (code) DO UPDATE
     SET name = EXCLUDED.name,
         source = 'excel',
         is_active = TRUE,
         updated_at = NOW()
     RETURNING id::text AS id, code, name`,
    [code, workerTypeName],
  );
  counters.workerTypes.add(result.rows[0]!.id);
  return result.rows[0]!;
}

async function ensureDepartment(
  client: Queryable,
  name: string,
  counters: ImportCounters,
): Promise<{ id: string; code: string; name: string }> {
  const departmentName = normalizeNameKey(name);
  const code = normalizeCode(departmentName, "dept");
  const result = await client.query<{ id: string; code: string; name: string }>(
    `INSERT INTO departments (name, code)
     VALUES ($1, $2)
     ON CONFLICT (code) DO UPDATE
     SET name = EXCLUDED.name,
         is_active = TRUE,
         updated_at = NOW()
     RETURNING id::text AS id, code, name`,
    [departmentName, code],
  );
  counters.departments.add(result.rows[0]!.id);
  return result.rows[0]!;
}

async function ensureArrangement(
  client: Queryable,
  departmentId: string,
  name: string,
  counters: ImportCounters,
): Promise<{ id: string; code: string; name: string }> {
  const arrangementName = normalizeNameKey(name);
  const code = normalizeCode(arrangementName, "arr");
  const result = await client.query<{ id: string; code: string; name: string }>(
    `INSERT INTO arrangements (department_id, name, code)
     VALUES ($1, $2, $3)
     ON CONFLICT (department_id, code) DO UPDATE
     SET name = EXCLUDED.name,
         is_active = TRUE,
         updated_at = NOW()
     RETURNING id::text AS id, code, name`,
    [departmentId, arrangementName, code],
  );
  counters.arrangements.add(result.rows[0]!.id);
  return result.rows[0]!;
}

async function getRegularSeniorityId(client: Queryable): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id::text AS id
     FROM seniorities
     WHERE code = 'regular'
     LIMIT 1`,
  );
  return result.rows[0]?.id ?? null;
}

async function ensureUserDepartment(client: Queryable, userId: string, departmentId: string): Promise<void> {
  await client.query(
    `INSERT INTO user_departments (user_id, department_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, department_id) DO NOTHING`,
    [userId, departmentId],
  );
}

async function ensureUser(
  client: Queryable,
  name: string,
  workerType: { id: string; name: string },
  departmentId: string | null,
  counters: ImportCounters,
): Promise<string> {
  const fullName = normalizeNameKey(name);
  const existing = await client.query<{ id: string }>(
    `SELECT id
     FROM users
     WHERE LOWER(full_name) = LOWER($1)
     LIMIT 1`,
    [fullName],
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE users
       SET worker_type_id = COALESCE(worker_type_id, $2),
           updated_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id, workerType.id],
    );
    if (departmentId) await ensureUserDepartment(client, existing.rows[0].id, departmentId);
    counters.workers.add(existing.rows[0].id);
    return existing.rows[0].id;
  }

  const hash = hashText(fullName);
  const userId = `excel:${hash}`;
  const seniorityId = await getRegularSeniorityId(client);
  const legacyRole = legacyRoleForWorkerType(workerType.name);
  const result = await client.query<{ id: string }>(
    `INSERT INTO users (id, email, full_name, role, seniority_id, worker_type_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE
     SET full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         worker_type_id = COALESCE(users.worker_type_id, EXCLUDED.worker_type_id),
         updated_at = NOW()
     RETURNING id`,
    [userId, `excel-${hash}@planli.local`, fullName, legacyRole, seniorityId, workerType.id],
  );

  if (departmentId) await ensureUserDepartment(client, result.rows[0]!.id, departmentId);
  counters.workers.add(result.rows[0]!.id);
  return result.rows[0]!.id;
}

async function ensureEligibility(
  client: Queryable,
  input: {
    userId: string;
    workerTypeId: string;
    monthStart: string;
    sourceSheet: string;
    departmentId?: string | null;
    arrangementId?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO worker_eligibilities (
       user_id,
       worker_type_id,
       month_start,
       department_id,
       arrangement_id,
       source,
       source_sheet
     )
     VALUES ($1, $2, $3, $4, $5, 'excel', $6)
     ON CONFLICT DO NOTHING`,
    [
      input.userId,
      input.workerTypeId,
      input.monthStart,
      input.departmentId ?? null,
      input.arrangementId ?? null,
      input.sourceSheet,
    ],
  );
}

async function insertWorkerState(
  client: Queryable,
  input: {
    userId: string;
    monthStart: string;
    stateType: string;
    priority: "HARD" | "SOFT";
    dateIso: string;
    reason: string;
    sourceSheet: string;
    sourceCell: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO worker_states (
       user_id,
       month_start,
       state_type,
       priority,
       start_time,
       end_time,
       is_full_day,
       reason,
       source,
       source_sheet,
       source_cell
     )
     VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, TRUE, $7, 'excel', $8, $9)`,
    [
      input.userId,
      input.monthStart,
      input.stateType,
      input.priority,
      fullDayStart(input.dateIso),
      fullDayEnd(input.dateIso),
      input.reason,
      input.sourceSheet,
      input.sourceCell,
    ],
  );
}

async function insertShiftRequirement(
  client: Queryable,
  shiftId: number,
  workerTypeId: string,
  incrementBy: number,
): Promise<void> {
  await client.query(
    `INSERT INTO shift_requirements (shift_id, worker_type_id, required_count)
     VALUES ($1, $2, $3)
     ON CONFLICT (shift_id, worker_type_id) DO UPDATE
     SET required_count = shift_requirements.required_count + EXCLUDED.required_count,
         updated_at = NOW()`,
    [shiftId, workerTypeId, incrementBy],
  );
}

async function ensureWeek(client: Queryable, shiftDate: string): Promise<string> {
  const date = new Date(`${shiftDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  const weekStart = date.toISOString().slice(0, 10);
  await client.query(
    `INSERT INTO weeks (week_start)
     VALUES ($1)
     ON CONFLICT (week_start) DO NOTHING`,
    [weekStart],
  );
  return weekStart;
}

async function createImportedShift(
  client: Queryable,
  input: {
    monthStart: string;
    departmentId: string;
    arrangementId: string;
    shiftDate: string;
    label: string;
  },
): Promise<number> {
  const weekStart = await ensureWeek(client, input.shiftDate);
  const result = await client.query<{ id: number }>(
    `INSERT INTO shifts (
       week_start,
       month_start,
       department_id,
       arrangement_id,
       shift_date,
       start_time,
       end_time,
       label
     )
     VALUES ($1, $2, $3, $4, $5, '08:00', '16:00', $6)
     RETURNING id`,
    [
      weekStart,
      input.monthStart,
      input.departmentId,
      input.arrangementId,
      input.shiftDate,
      input.label,
    ],
  );
  return result.rows[0]!.id;
}

async function findWorkerColumns(
  workbook: XLSX.WorkBook,
  monthStart: string,
  sheetNames: string[],
  counters: ImportCounters,
): Promise<{
  columns: WorkerColumn[];
  workerByName: Map<string, ImportWorker>;
}> {
  return withDatabaseTransaction(async (client) => {
    const columns: WorkerColumn[] = [];
    const workerByName = new Map<string, ImportWorker>();

    await client.query(
      `INSERT INTO months (month_start)
       VALUES ($1)
       ON CONFLICT (month_start) DO NOTHING`,
      [monthStart],
    );

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet?.["!ref"]) continue;
      const range = XLSX.utils.decode_range(sheet["!ref"]);

      for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
        const workerTypeName = getMergedText(sheet, 0, columnIndex);
        const workerName = normalizeNameKey(getCellText(sheet, 1, columnIndex));
        if (!isWorkerTypeLabel(workerTypeName) || !isWorkerName(workerName)) continue;

        const workerType = await ensureWorkerType(client, workerTypeName, counters);
        const userId = await ensureUser(client, workerName, workerType, null, counters);
        await ensureEligibility(client, {
          userId,
          workerTypeId: workerType.id,
          monthStart,
          sourceSheet: sheetName,
        });

        const worker: ImportWorker = {
          userId,
          workerName,
          workerTypeId: workerType.id,
          workerTypeCode: workerType.code,
          workerTypeName: workerType.name,
        };
        columns.push({ ...worker, sheetName, columnIndex });
        if (!workerByName.has(workerName)) {
          workerByName.set(workerName, worker);
        }
      }
    }

    return { columns, workerByName };
  });
}

async function importWorkerStates(
  workbook: XLSX.WorkBook,
  monthStart: string,
  workerColumns: WorkerColumn[],
  counters: ImportCounters,
): Promise<void> {
  await withDatabaseTransaction(async (client) => {
    await client.query(
      `DELETE FROM worker_states
       WHERE month_start = $1
         AND source = 'excel'`,
      [monthStart],
    );

    for (const workerColumn of workerColumns) {
      const sheet = workbook.Sheets[workerColumn.sheetName];
      if (!sheet?.["!ref"]) continue;
      const range = XLSX.utils.decode_range(sheet["!ref"]);

      for (let rowIndex = 2; rowIndex <= range.e.r; rowIndex += 1) {
        const dateIso = dateForSheetRow(sheet, rowIndex, monthStart);
        if (!dateIso || dateIso < monthStart || dateIso >= nextMonthStart(monthStart)) continue;

        const cell = getCell(sheet, rowIndex, workerColumn.columnIndex);
        const text = cellText(cell?.v);
        const fillRgb = getFillRgb(cell);
        if (!text && !isSignificantFill(fillRgb)) continue;

        const state = classifyState(text, fillRgb);
        await insertWorkerState(client, {
          userId: workerColumn.userId,
          monthStart,
          stateType: state.stateType,
          priority: state.priority,
          dateIso,
          reason: text || `Excel color ${fillRgb}`,
          sourceSheet: workerColumn.sheetName,
          sourceCell: XLSX.utils.encode_cell({ r: rowIndex, c: workerColumn.columnIndex }),
        });
        counters.states += 1;
      }
    }
  });
}

async function importFinalSchedule(
  workbook: XLSX.WorkBook,
  monthStart: string,
  finalSheetName: string | null,
  workerByName: Map<string, ImportWorker>,
  actorId: string,
  counters: ImportCounters,
): Promise<void> {
  if (!finalSheetName) return;
  const sheet = workbook.Sheets[finalSheetName];
  if (!sheet?.["!ref"]) return;

  await withDatabaseTransaction(async (client) => {
    await client.query(
      `UPDATE months
       SET published_monthly_schedule_version_id = NULL,
           published_at = NULL,
           updated_at = NOW()
       WHERE month_start = $1`,
      [monthStart],
    );
    await client.query(`DELETE FROM monthly_schedule_runs WHERE month_start = $1`, [monthStart]);
    await client.query(`DELETE FROM shifts WHERE month_start = $1`, [monthStart]);

    const runResult = await client.query<{ id: string }>(
      `INSERT INTO monthly_schedule_runs (month_start, triggered_by, status, started_at, finished_at, solver_meta)
       VALUES ($1, $2, 'SUCCEEDED', NOW(), NOW(), '{"source":"excel_import"}'::jsonb)
       RETURNING id::text AS id`,
      [monthStart, actorId],
    );
    const runId = runResult.rows[0]!.id;

    const versionResult = await client.query<{ id: string }>(
      `INSERT INTO monthly_schedule_versions (month_start, run_id, version_number, is_published, created_by)
       VALUES ($1, $2, 1, TRUE, $3)
       RETURNING id::text AS id`,
      [monthStart, runId, actorId],
    );
    const versionId = versionResult.rows[0]!.id;

    const sheetRef = sheet["!ref"];
    if (!sheetRef) return;
    const range = XLSX.utils.decode_range(sheetRef);
    const knownNames = new Set(workerByName.keys());

    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const departmentName = getMergedText(sheet, 0, columnIndex);
      const arrangementName = getCellText(sheet, 1, columnIndex);
      if (!isScheduleDepartmentLabel(departmentName) || !arrangementName) continue;
      if (arrangementName === "תאריך" || arrangementName === "יום בשבוע") continue;

      const department = await ensureDepartment(client, departmentName, counters);
      const arrangement = await ensureArrangement(client, department.id, arrangementName, counters);

      for (let rowIndex = 2; rowIndex <= range.e.r; rowIndex += 1) {
        const shiftDate = dateForSheetRow(sheet, rowIndex, monthStart);
        if (!shiftDate || shiftDate < monthStart || shiftDate >= nextMonthStart(monthStart)) continue;

        const rawAssignment = cellText(getCell(sheet, rowIndex, columnIndex)?.v);
        const assignedNames = splitAssignedNames(rawAssignment, knownNames);
        if (assignedNames.length === 0) continue;

        const shiftId = await createImportedShift(client, {
          monthStart,
          departmentId: department.id,
          arrangementId: arrangement.id,
          shiftDate,
          label: arrangement.name,
        });
        counters.shifts += 1;

        for (const assignedName of assignedNames) {
          const knownWorker = workerByName.get(normalizeNameKey(assignedName));
          const workerType = knownWorker
            ? {
                id: knownWorker.workerTypeId,
                code: knownWorker.workerTypeCode,
                name: knownWorker.workerTypeName,
              }
            : await ensureWorkerType(client, arrangement.name, counters);

          const userId = knownWorker?.userId
            ?? await ensureUser(client, assignedName, workerType, department.id, counters);
          await ensureUserDepartment(client, userId, department.id);
          await ensureEligibility(client, {
            userId,
            workerTypeId: workerType.id,
            monthStart,
            sourceSheet: finalSheetName,
            departmentId: department.id,
            arrangementId: arrangement.id,
          });
          await insertShiftRequirement(client, shiftId, workerType.id, 1);

          await client.query(
            `INSERT INTO monthly_schedule_assignments (
               monthly_schedule_version_id,
               shift_id,
               user_id,
               worker_type_id,
               department_id,
               arrangement_id,
               source
             )
             VALUES ($1, $2, $3, $4, $5, $6, 'excel')
             ON CONFLICT (monthly_schedule_version_id, shift_id, user_id) DO NOTHING`,
            [versionId, shiftId, userId, workerType.id, department.id, arrangement.id],
          );
          counters.assignments += 1;
        }
      }
    }

    await client.query(
      `UPDATE months
       SET status = 'PUBLISHED',
           published_at = NOW(),
           published_monthly_schedule_version_id = $2,
           updated_at = NOW()
       WHERE month_start = $1`,
      [monthStart, versionId],
    );
  });
}

function inferMonthStart(workbook: XLSX.WorkBook, explicitMonth?: string): string {
  if (explicitMonth) return normalizeMonthStart(explicitMonth);

  const monthSheet = workbook.SheetNames.find((name) => /(?:^|\s)(\d{2})\.(\d{2})(?:\s|$)/.test(name));
  const match = monthSheet?.match(/(?:^|\s)(\d{2})\.(\d{2})(?:\s|$)/);
  if (match) {
    return normalizeMonthStart(`20${match[2]}-${match[1]}`);
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    for (let rowIndex = range.s.r; rowIndex <= Math.min(range.e.r, 10); rowIndex += 1) {
      for (let columnIndex = range.s.c; columnIndex <= Math.min(range.e.c, 5); columnIndex += 1) {
        const iso = dateToIsoDate(getCell(sheet, rowIndex, columnIndex)?.v);
        if (iso) return normalizeMonthStart(iso);
      }
    }
  }

  throw new Error("Could not infer month from workbook; send month as YYYY-MM");
}

export const ExcelImportService = {
  async importMonth(input: {
    filePath?: string;
    workbookBase64?: string;
    month?: string;
    actorId: string;
  }): Promise<ExcelMonthImportResult> {
    let buffer: Buffer;
    if (input.workbookBase64) {
      buffer = Buffer.from(input.workbookBase64, "base64");
    } else if (input.filePath) {
      buffer = await fs.readFile(input.filePath);
    } else {
      throw new Error("file_path or workbook_base64 is required");
    }

    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      cellStyles: true,
    });
    const monthStart = inferMonthStart(workbook, input.month);
    const sheetsRead = sourceSheetNames(workbook, monthStart);
    const finalSheetName = findSheetName(workbook, FINAL_SCHEDULE_SHEET_LABEL);
    const counters: ImportCounters = {
      workerTypes: new Set<string>(),
      workers: new Set<string>(),
      states: 0,
      departments: new Set<string>(),
      arrangements: new Set<string>(),
      shifts: 0,
      assignments: 0,
    };

    const { columns, workerByName } = await findWorkerColumns(
      workbook,
      monthStart,
      sheetsRead,
      counters,
    );
    await importWorkerStates(workbook, monthStart, columns, counters);
    await importFinalSchedule(workbook, monthStart, finalSheetName, workerByName, input.actorId, counters);

    return {
      monthStart,
      sheetsRead,
      workerTypesImported: counters.workerTypes.size,
      workersImported: counters.workers.size,
      workerStatesImported: counters.states,
      departmentsImported: counters.departments.size,
      arrangementsImported: counters.arrangements.size,
      shiftsImported: counters.shifts,
      assignmentsImported: counters.assignments,
    };
  },
};
