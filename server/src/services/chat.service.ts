import OpenAI from "openai";
import { z } from "zod";
import { queryDatabase } from "./database.service.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Sender = "staff" | "assistant";

interface ConversationRow {
  id: string;
  user_message_count: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender: Sender;
  content: string;
  created_at: Date;
}

interface TranscriptMessage {
  sender: Sender;
  content: string;
}

interface SendMessageInput {
  userId: string;
  message: string;
}

interface SendMessageResult {
  conversationId: string;
  assistantText: string;
}

const intentEnum = z.enum(["constraint", "schedule_query", "general", "out_of_scope"]);
const constraintTypeEnum = z.enum(["HARD", "SOFT"]);
const STORABLE_INTENTS = new Set<z.infer<typeof intentEnum>>(["constraint", "schedule_query"]);

const intentResponseSchema = z.object({
  intent: intentEnum,
  confidence: z.number().min(0).max(1),
  assistant_reply: z.string(),
  constraints: z.array(
    z.object({
      start_time: z.string(),
      end_time: z.string(),
      type: constraintTypeEnum,
      reason: z.string(),
    }),
  ),
});

type IntentResponse = z.infer<typeof intentResponseSchema>;

const intentSystemPrompt = `You are an intent detection assistant for a medical scheduling chatbot.

Return STRICT JSON only. No markdown, no prose outside JSON, and no extra keys.

Schema requirements:
- intent: one of "constraint", "schedule_query", "general", "out_of_scope"
- confidence: number in range [0, 1]
- assistant_reply: short natural-language response in the user's language!! this is the most important!!!
- constraints: array of constraint objects; return [] when no constraint should be stored
- Add emojis to your assistant_reply to make it friendly and creative.
- Always end naturally and ask if the user needs anything else.

Intent rules:
1) constraint
   - User states they cannot/should not be available at a time window.
   - Extract each unavailable time window as a separate object in constraints.
   - MUST split multiple days and/or multiple time windows into multiple constraint objects.
   - Extract start_time and end_time as ISO-8601 strings with timezone offset.
   - Extract type as "HARD" or "SOFT". If unclear, default to "HARD".
   Classification rules for type:
    - "לא יכול", "אסור", "יש לי", "חייב", medical leave → HARD
    - "מעדיף", "עדיף", "אם אפשר", "רוצה להימנע" → SOFT
    If strong inability is expressed → HARD.
    If preference language is used → SOFT.
   - reason must be a short, specific reason phrase for the same constraint window (for example: "doctor appointment", "family event", "prefers to avoid night shifts").
   - Never copy the full user message into reason.
   - If time is ambiguous or cannot be resolved confidently, ask a follow-up question in assistant_reply and return constraints as [].

2) schedule_query
   - User asks to check, view, or inspect schedule/calendar.
   - assistant_reply should indicate you will check the schedule.

3) general
   - Keep behavior concise and friendly, but still related to medical scheduling.

4) out_of_scope
   - Any request unrelated to medical scheduling and availability.
   - Do NOT answer the question itself.
   - Politely explain you can only help with scheduling/availability.
   - constraints must be [].

JSON examples:
{"intent":"constraint","confidence":0.92,"assistant_reply":"Got it ✅ I marked you unavailable Tuesday evening. Need anything else?","constraints":[{"start_time":"2026-02-24T18:00:00+02:00","end_time":"2026-02-24T22:00:00+02:00","type":"HARD","reason":"doctor appointment"}]}
{"intent":"constraint","confidence":0.84,"assistant_reply":"Thanks 🙌 I blocked both requested windows. Need anything else?","constraints":[{"start_time":"2026-02-24T08:00:00+02:00","end_time":"2026-02-24T12:00:00+02:00","type":"HARD","reason":"medical leave"},{"start_time":"2026-02-25T14:00:00+02:00","end_time":"2026-02-25T18:00:00+02:00","type":"SOFT","reason":"prefers family time"}]}
{"intent":"constraint","confidence":0.35,"assistant_reply":"I can add that, but what exact hours should I block on Tuesday? ⏰ Need anything else?","constraints":[]}
{"intent":"schedule_query","confidence":0.88,"assistant_reply":"I can help check your schedule 📅 Would you like this week or next week?","constraints":[]}
{"intent":"general","confidence":0.75,"assistant_reply":"Sure 😊 I can help with your medical schedule. What would you like to set?","constraints":[]}
{"intent":"out_of_scope","confidence":0.99,"assistant_reply":"I’m here for scheduling only 🩺📆 Please ask me about availability or shifts. Anything else I can schedule for you?","constraints":[]}`;

function getWeekStartSunday(input: Date): string {
  const localMidnight = new Date(input);
  localMidnight.setHours(0, 0, 0, 0);
  const day = localMidnight.getDay();
  localMidnight.setDate(localMidnight.getDate() - day);
  const year = localMidnight.getFullYear();
  const month = String(localMidnight.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(localMidnight.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

export const ChatService = {
  async sendMessage({ userId, message }: SendMessageInput): Promise<SendMessageResult> {
    await this.ensureUserExists(userId);
    const conversationId = await this.getOrCreateConversation(userId);
    await this.incrementAndGetUserMessageCount(conversationId);

    const persistedConversationMessages = await this.getMessagesByConversationId(conversationId);
    const conversationWithIncomingMessage: TranscriptMessage[] = [
      ...persistedConversationMessages,
      {
        sender: "staff",
        content: message,
      },
    ];

    const intentResponse = await this.generateAssistantResponse(conversationWithIncomingMessage);
    const shouldPersistMessages = STORABLE_INTENTS.has(intentResponse.intent);

    if (shouldPersistMessages) {
      await this.createMessage({
        conversationId,
        sender: "staff",
        content: message,
      });
    }

    if (intentResponse.intent === "constraint" && intentResponse.constraints.length > 0) {
      for (const constraint of intentResponse.constraints) {
        await this.saveConstraint({
          userId,
          startTimeIso: constraint.start_time,
          endTimeIso: constraint.end_time,
          priority: constraint.type,
          reason: constraint.reason,
          sourceMessage: message,
        });
      }
    }

    if (shouldPersistMessages) {
      await this.createMessage({
        conversationId,
        sender: "assistant",
        content: intentResponse.assistant_reply,
      });
    }

    return {
      conversationId,
      assistantText: intentResponse.assistant_reply,
    };
  },

  async getConversationByUserId(userId: string) {
    await this.ensureUserExists(userId);
    const conversationId = await this.getOrCreateConversation(userId);
    const messages = await this.getMessagesByConversationId(conversationId);

    return {
      conversationId,
      messages,
    };
  },

  async getOrCreateConversation(userId: string): Promise<string> {
    const existingConversation = await queryDatabase<ConversationRow>(
      "SELECT id, user_message_count FROM conversations WHERE user_id = $1 LIMIT 1",
      [userId],
    );

    if (existingConversation.rows[0]) {
      return existingConversation.rows[0].id;
    }

    const createdConversation = await queryDatabase<ConversationRow>(
      "INSERT INTO conversations (user_id, user_message_count) VALUES ($1, 0) RETURNING id, user_message_count",
      [userId],
    );

    return createdConversation.rows[0].id;
  },

  async incrementAndGetUserMessageCount(conversationId: string): Promise<number> {
    const result = await queryDatabase<ConversationRow>(
      `UPDATE conversations
       SET user_message_count = user_message_count + 1
       WHERE id = $1
       RETURNING id, user_message_count`,
      [conversationId],
    );

    return result.rows[0]?.user_message_count ?? 1;
  },

  async ensureUserExists(userId: string) {
    const emailLocalPart = userId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64) || "user";

    await queryDatabase(
      `INSERT INTO users (id, email, full_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [userId, `${emailLocalPart}@planli.local`, userId, "staff"],
    );
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

  formatTranscript(messages: TranscriptMessage[]): string {
    return messages
      .map((message) => {
        const role = message.sender === "staff" ? "User" : "Assistant";
        return `${role}: ${message.content}`;
      })
      .join("\n");
  },

  async generateAssistantResponse(messages: TranscriptMessage[]): Promise<IntentResponse> {
    const transcript = this.formatTranscript(messages);

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_output_tokens: 350,
      input: [
        {
          role: "system",
          content: intentSystemPrompt,
        },
        {
          role: "user",
          content: transcript,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "chat_intent_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              intent: {
                type: "string",
                enum: ["constraint", "schedule_query", "general", "out_of_scope"],
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              assistant_reply: { type: "string" },
              constraints: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    start_time: { type: "string" },
                    end_time: { type: "string" },
                    type: { type: "string", enum: ["HARD", "SOFT"] },
                    reason: { type: "string" },
                  },
                  required: ["start_time", "end_time", "type", "reason"],
                  additionalProperties: false,
                },
              },
            },
            required: ["intent", "confidence", "assistant_reply", "constraints"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = intentResponseSchema.safeParse(JSON.parse(response.output_text));
    if (!parsed.success) {
      return {
        intent: "general",
        confidence: 0,
        assistant_reply:
          "I can help with medical scheduling and availability 🩺📅 Please share your preferred shift or blocked time. Need anything else?",
        constraints: [],
      };
    }

    return parsed.data;
  },

  async saveConstraint(input: {
    userId: string;
    startTimeIso: string;
    endTimeIso: string;
    priority: z.infer<typeof constraintTypeEnum>;
    reason: string;
    sourceMessage: string;
  }) {
    const startDate = new Date(input.startTimeIso);
    const endDate = new Date(input.endTimeIso);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return;
    }

    if (endDate <= startDate) {
      return;
    }

    const isFullDay =
      input.startTimeIso.includes("T00:00:00") && input.endTimeIso.includes("T23:59:59");

    const weekStart = getWeekStartSunday(startDate);

    await queryDatabase(
      `INSERT INTO constraints (user_id, week_start, start_time, end_time, priority, reason, source_message, is_full_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.userId,
        weekStart,
        startDate,
        endDate,
        input.priority,
        input.reason,
        input.sourceMessage,
        isFullDay,
      ],
    );
  },
};
