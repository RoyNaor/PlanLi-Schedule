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
  async sendMessage(req: Request, res: Response) {
    const parsed = sendMessageSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json(parsed.error.format());
    }

    try {
      const { userId, message } = parsed.data;
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

  async getConversation(req: Request, res: Response) {
    const parsed = userParamsSchema.safeParse(req.params);

    if (!parsed.success) {
      return res.status(400).json(parsed.error.format());
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
