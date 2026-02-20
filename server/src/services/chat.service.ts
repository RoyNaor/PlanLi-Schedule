import OpenAI from "openai";
import { queryDatabase } from "./database.service.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Sender = "staff" | "assistant";

interface ConversationRow {
  id: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender: Sender;
  content: string;
  created_at: Date;
}

interface SendMessageInput {
  userId: string;
  message: string;
}

interface SendMessageResult {
  conversationId: string;
  assistantText: string;
}

export const ChatService = {
  async sendMessage({ userId, message }: SendMessageInput): Promise<SendMessageResult> {
    const conversationId = await this.getOrCreateConversation(userId);

    await this.createMessage({
      conversationId,
      sender: "staff",
      content: message,
    });

    const conversationMessages = await this.getMessagesByConversationId(conversationId);
    const assistantText = await this.generateAssistantResponse(conversationMessages);

    await this.createMessage({
      conversationId,
      sender: "assistant",
      content: assistantText,
    });

    return {
      conversationId,
      assistantText,
    };
  },

  async getConversationByUserId(userId: string) {
    const conversationId = await this.getOrCreateConversation(userId);
    const messages = await this.getMessagesByConversationId(conversationId);

    return {
      conversationId,
      messages,
    };
  },

  async getOrCreateConversation(userId: string): Promise<string> {
    const existingConversation = await queryDatabase<ConversationRow>(
      "SELECT id FROM conversations WHERE user_id = $1 LIMIT 1",
      [userId],
    );

    if (existingConversation.rows[0]) {
      return existingConversation.rows[0].id;
    }

    const createdConversation = await queryDatabase<ConversationRow>(
      "INSERT INTO conversations (user_id) VALUES ($1) RETURNING id",
      [userId],
    );

    return createdConversation.rows[0].id;
  },

  async createMessage(input: {
    conversationId: string;
    sender: Sender;
    content: string;
  }) {
    await queryDatabase(
      "INSERT INTO messages (conversation_id, sender, content) VALUES ($1, $2, $3)",
      [input.conversationId, input.sender, input.content],
    );
  },

  async getMessagesByConversationId(conversationId: string): Promise<MessageRow[]> {
    const result = await queryDatabase<MessageRow>(
      `SELECT id, conversation_id, sender, content, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId],
    );

    return result.rows;
  },

  async generateAssistantResponse(messages: MessageRow[]): Promise<string> {
    const transcript = messages
      .map((message) => {
        const role = message.sender === "staff" ? "User" : "Assistant";
        return `${role}: ${message.content}`;
      })
      .join("\n");

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      max_output_tokens: 250,
      input: [
        {
          role: "system",
          content:
            "You are a medical scheduling assistant. Do not classify intent or extract structured intent fields. Respond naturally to the user's latest message.",
        },
        {
          role: "user",
          content: transcript,
        },
      ],
    });

    return response.output_text;
  },
};
