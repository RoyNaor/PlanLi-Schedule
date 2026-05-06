import type { Request, Response } from "express";
import { z } from "zod";
import { ExcelImportService } from "../services/excel-import.service.js";
import { UserService } from "../services/user.service.js";

const excelMonthImportSchema = z
  .object({
    file_path: z.string().trim().min(1).optional(),
    workbook_base64: z.string().trim().min(1).optional(),
    month: z.string().trim().optional(),
  })
  .refine((value) => Boolean(value.file_path || value.workbook_base64), {
    message: "file_path or workbook_base64 is required",
  });

async function requireAdmin(req: Request, res: Response) {
  if (!req.authUser?.uid) {
    return { error: res.status(401).json({ error: "Missing authenticated user" }) };
  }

  const actor = await UserService.getUserById(req.authUser.uid);
  if (!actor) {
    return { error: res.status(404).json({ error: "Authenticated user not found" }) };
  }
  if (actor.role !== "admin") {
    return { error: res.status(403).json({ error: "Admin access required" }) };
  }

  return { actor };
}

export const importController = {
  async importExcelMonth(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const parsed = excelMonthImportSchema.parse(req.body);
      const result = await ExcelImportService.importMonth({
        filePath: parsed.file_path,
        workbookBase64: parsed.workbook_base64,
        month: parsed.month,
        actorId: adminCheck.actor.id,
      });

      return res.status(201).json({ imported: true, result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message = error instanceof Error ? error.message : "Failed to import Excel month";
      console.error("Error importing Excel month:", error);
      return res.status(400).json({ error: message });
    }
  },
};
