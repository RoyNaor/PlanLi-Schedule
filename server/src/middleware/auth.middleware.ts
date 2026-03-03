import type { NextFunction, Request, Response } from "express";
import { AuthService, type AuthenticatedUser } from "../services/auth.service.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

// Extracts bearer auth data and attaches the parsed user identity to the request.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = AuthService.parseBearerToken(req.header("authorization"));
    req.authUser = await AuthService.extractUserFromToken(token);
    return next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(401).json({ error: message });
  }
}
