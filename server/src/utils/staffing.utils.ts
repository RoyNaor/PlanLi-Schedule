export const userRoleValues = [
  "admin",
  "doctor",
  "nurse",
  "midwife",
  "obgyn",
  "anesthesiologist",
  "orderly",
  "pediatrician",
  "shabbat_scribe",
  "secretary",
] as const;

export const staffRoleValues = userRoleValues.filter((role) => role !== "admin");

export const shiftStaffingFields = [
  "min_doctors",
  "min_nurses",
  "min_midwives",
  "min_obgyns",
  "min_anesthesiologists",
  "min_orderlies",
  "min_pediatricians",
  "min_shabbat_scribes",
  "min_secretaries",
] as const;
