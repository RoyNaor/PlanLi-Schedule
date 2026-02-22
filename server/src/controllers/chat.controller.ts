import type { Request, Response } from "express";
import z from "zod";
import { ChatService } from "../services/chat.service.js";

const sendMessageSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(1000, "Message cannot exceed 1000 characters"),
});

const userParamsSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export const chatController = {
  // Validates and stores a user message, then returns the assistant response.
  async sendMessage(req: Request, res: Response) {
    // Validate payload shape before any side effects occur.
    const parsed = sendMessageSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json(parsed.error.format());
    }

    if (!req.authUser?.uid) {
      return res.status(401).json({ error: "Missing authenticated user" });
    }

    try {
      const { userId, message } = parsed.data;

      if (userId !== req.authUser.uid) {
        return res.status(403).json({ error: "You can access only your own conversation" });
      }

      const response = await ChatService.sendMessage({ userId, message });

      return res.status(200).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error sending chat message:", error);

      if (message.includes("violates foreign key constraint")) {
        return res.status(404).json({
          error:
            "User does not exist. Create the user first before starting a conversation.",
        });
      }

      return res
        .status(500)
        .json({ error: "An error occurred while processing your request." });
    }
  },

  // Fetches full conversation history for the provided user identifier.
  async getConversation(req: Request, res: Response) {
    // Validate route params to avoid malformed DB queries.
    const parsed = userParamsSchema.safeParse(req.params);

    if (!parsed.success) {
      return res.status(400).json(parsed.error.format());
    }

    if (!req.authUser?.uid) {
      return res.status(401).json({ error: "Missing authenticated user" });
    }

    if (parsed.data.userId !== req.authUser.uid) {
      return res.status(403).json({ error: "You can access only your own conversation" });
    }

    try {
      const response = await ChatService.getConversationByUserId(parsed.data.userId);
      return res.status(200).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error getting conversation:", error);

      if (message.includes("violates foreign key constraint")) {
        return res.status(404).json({
          error:
            "User does not exist. Create the user first before starting a conversation.",
        });
      }

      return res
        .status(500)
        .json({ error: "An error occurred while fetching the conversation." });
    }
  },
};
