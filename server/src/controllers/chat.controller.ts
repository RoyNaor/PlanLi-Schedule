import type { Request, Response } from "express";
import z from "zod";
//import { ChatService } from "../services/chat.service";

const chatSchema = z.object({
  message: z.string()
  .trim()
  .min(1, "Message cannot be empty")
  .max(500, "Message cannot exceed 500 characters"),
  conversationId: z.string().uuid("Invalid conversation ID format")
});

export const chatController = {

  async sendMessage(req: Request, res: Response) {
    const parsed = chatSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json(parsed.error.format());
    }

    try {
        const { message, conversationId } = req.body; 
        //const response = await ChatService.sendMessage(message, conversationId);
        

        //res.json({reply: response.output_text})

    } catch (error) {
        console.error("Error communicating with OpenAI:", error);
        res.status(500).json({ error: "An error occurred while processing your request." });
    }
  }

};