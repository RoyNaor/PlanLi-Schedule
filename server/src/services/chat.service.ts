import OpenAI from "openai";
import { z } from "zod";
import { queryDatabase } from "./database.service.js";
import {
  formatIsraelNowIso,
  formatTranscript,
  getWeekStartSundayInIsrael,
  Sender,
  toIsraelDateParts,
  TranscriptMessage,
} from "../utils/chat.utils.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

const intentSystemPrompt = `אתה עוזר לזיהוי כוונה (intent) עבור צ'אטבוט תזמון רפואי. תמיד תחזיר תשובה בעברית בלבד.

החזר STRICT JSON בלבד. בלי markdown, בלי טקסט מחוץ ל-JSON, ובלי שדות נוספים.

דרישות סכימה:
- intent: אחד מתוך "constraint", "schedule_query", "general", "out_of_scope"
- confidence: מספר בטווח [0, 1]
- assistant_reply: תשובה קצרה וטבעית בעברית בלבד (לא אנגלית).
- constraints: מערך של אובייקטי אילוצים; החזר [] כאשר אין מה לשמור.
- אפשר להוסיף אימוג'ים ב-assistant_reply כדי לשמור על טון ידידותי.
- סיים בצורה טבעית ושאל אם צריך עוד משהו.

כללי זיהוי:
1) constraint
   - המשתמש מציין שאינו יכול/לא רוצה להיות זמין בטווח זמן מסוים.
   - חלץ כל חלון אי-זמינות כאובייקט נפרד בתוך constraints.
   - חובה לפצל כמה ימים ו/או כמה חלונות זמן למספר אובייקטים נפרדים.
   - חלץ start_time ו-end_time כמחרוזות ISO-8601 עם אזור זמן.
   - חלץ type כ-"HARD" או "SOFT". אם לא ברור, ברירת מחדל "HARD".
   כללי סיווג לסוג:
    - "לא יכול", "אסור", "יש לי", "חייב", "חופשת מחלה" → HARD
    - "מעדיף", "עדיף", "אם אפשר", "רוצה להימנע" → SOFT
   - reason חייב להיות נימוק קצר וספציפי לאותו חלון זמן.
   - אין להעתיק את כל הודעת המשתמש לשדה reason.
   - אם הזמן עמום או לא ניתן לפענוח ודאי, בקש שאלה מבהירה ב-assistant_reply והחזר constraints: [].

2) schedule_query
   - המשתמש מבקש לבדוק/לראות את לוח הזמנים.
   - assistant_reply צריך לציין שתבדוק את הסידור.

3) general
   - השב בקצרה ובידידותיות בהקשר תזמון רפואי.

4) out_of_scope
   - כל בקשה שלא קשורה לתזמון רפואי וזמינות.
   - אל תענה על הבקשה עצמה.
   - הסבר בנימוס שאתה יכול לעזור רק בתזמון/זמינות.
   - constraints חייב להיות [].

דוגמאות JSON:
{"intent":"constraint","confidence":0.92,"assistant_reply":"מעולה ✅ סימנתי שאינך זמין ביום שלישי בערב. צריך עוד משהו?","constraints":[{"start_time":"2026-02-24T18:00:00+02:00","end_time":"2026-02-24T22:00:00+02:00","type":"HARD","reason":"תור לרופא"}]}
{"intent":"constraint","confidence":0.84,"assistant_reply":"תודה 🙌 חסמתי את שני חלונות הזמן שביקשת. צריך עוד משהו?","constraints":[{"start_time":"2026-02-24T08:00:00+02:00","end_time":"2026-02-24T12:00:00+02:00","type":"HARD","reason":"חופשת מחלה"},{"start_time":"2026-02-25T14:00:00+02:00","end_time":"2026-02-25T18:00:00+02:00","type":"SOFT","reason":"מעדיף זמן משפחה"}]}
{"intent":"constraint","confidence":0.35,"assistant_reply":"אשמח להוסיף, אבל מה השעות המדויקות לחסימה ביום שלישי? ⏰ צריך עוד משהו?","constraints":[]}
{"intent":"schedule_query","confidence":0.88,"assistant_reply":"בשמחה 📅 רוצה שאבדוק את השבוע הזה או השבוע הבא?","constraints":[]}
{"intent":"general","confidence":0.75,"assistant_reply":"בשמחה 😊 אני יכול לעזור בתזמון רפואי. מה תרצה לקבוע?","constraints":[]}
{"intent":"out_of_scope","confidence":0.99,"assistant_reply":"אני יכול לעזור רק בנושאי תזמון וזמינות 🩺📆 אפשר לרשום אילוץ או לבדוק משמרות. צריך עוד משהו?","constraints":[]}`;

export const ChatService = {
  // Persists a user message, asks the model for intent, stores constraints, and saves reply.
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
    const shouldPersistMessages =
      intentResponse.intent === "constraint" && intentResponse.constraints.length > 0;

    if (shouldPersistMessages) {
      await this.createMessage({
        conversationId,
        sender: "staff",
        content: message,
        intent: intentResponse.intent,
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
        intent: intentResponse.intent,
      });
    }

    return {
      conversationId,
      assistantText: intentResponse.assistant_reply,
    };
  },

  // Loads a conversation and all message rows for a given user id.
  async getConversationByUserId(userId: string) {
    await this.ensureUserExists(userId);
    const conversationId = await this.getOrCreateConversation(userId);
    const messages = await this.getMessagesByConversationId(conversationId);

    return {
      conversationId,
      messages,
    };
  },

  // Reuses an existing conversation or creates one if this user has none.
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

  // Increments and returns the number of staff messages in the conversation.
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

  // Creates a placeholder user row so chat inserts never fail on FK constraints.
  async ensureUserExists(userId: string) {
    const emailLocalPart = userId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64) || "user";

    await queryDatabase(
      `INSERT INTO users (id, email, full_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [userId, `${emailLocalPart}@planli.local`, userId, "staff"],
    );
  },

  // Inserts a single message row into the messages table.
  async createMessage(input: {
    conversationId: string;
    sender: Sender;
    content: string;
    intent: z.infer<typeof intentEnum>;
  }) {
    await queryDatabase(
      "INSERT INTO messages (conversation_id, sender, content, intent) VALUES ($1, $2, $3, $4)",
      [input.conversationId, input.sender, input.content, input.intent],
    );
  },

  // Returns conversation messages sorted in chronological order.
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

  // Calls OpenAI with strict JSON schema output to classify intent and extract constraints.
  async generateAssistantResponse(messages: TranscriptMessage[]): Promise<IntentResponse> {
    const transcript = formatTranscript(messages);
    const now = new Date();
    const israelNowIso = formatIsraelNowIso(now);
    const israelNowParts = toIsraelDateParts(now);

    // Ask the model for structured output so parsing stays deterministic.
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_output_tokens: 350,
      input: [
        {
          role: "system",
          content: `${intentSystemPrompt}

Current Israel date-time (ISO, Asia/Jerusalem): ${israelNowIso}
Current Israel year: ${israelNowParts.year}

Date resolution rules:
- Always resolve dates in Israel timezone (Asia/Jerusalem).
- Treat Sunday as the first day of the week.
- All relative expressions like "today", "tomorrow", "Sunday", "next week" must be resolved relative to Israel date-time above.
- If a year is not explicitly mentioned, assume the current Israel year.
- If only a weekday is mentioned (e.g., "Sunday"), assume the closest upcoming occurrence in Israel time.
- Always return full ISO-8601 with timezone offset.
- Never use past years unless explicitly stated.
`
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

    // Fallback to a safe generic response when model output does not match schema.
    const parsed = intentResponseSchema.safeParse(JSON.parse(response.output_text));
    if (!parsed.success) {
      return {
        intent: "general",
        confidence: 0,
        assistant_reply:
          "אני יכול לעזור בתזמון רפואי וזמינות 🩺📅 אפשר לכתוב משמרת רצויה או זמן לחסימה. צריך עוד משהו?",
        constraints: [],
      };
    }

    return parsed.data;
  },

  // Validates and stores a parsed availability constraint for scheduling logic.
  async saveConstraint(input: {
    userId: string;
    startTimeIso: string;
    endTimeIso: string;
    priority: z.infer<typeof constraintTypeEnum>;
    reason: string;
    sourceMessage: string;
  }) {

    // Mark full-day blocks so downstream schedulers can handle them differently.
    const isFullDay =
      input.startTimeIso.includes("T00:00:00") && input.endTimeIso.includes("T23:59:59");

    const startDate = new Date(input.startTimeIso);
    const endDate = new Date(input.endTimeIso);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      console.warn("[ChatService.saveConstraint] Skipping constraint due to invalid date", {
        startTimeIso: input.startTimeIso,
        endTimeIso: input.endTimeIso,
      });
      return;
    }

    if (endDate <= startDate) {
      console.warn("[ChatService.saveConstraint] Skipping constraint because end <= start", {
        startTimeIso: input.startTimeIso,
        endTimeIso: input.endTimeIso,
      });
      return;
    }

    // Persist the Israel-local week anchor for weekly planning queries.
    const weekStart = getWeekStartSundayInIsrael(startDate);

    await queryDatabase(
      `INSERT INTO constraints (user_id, week_start, start_time, end_time, priority, reason, source_message, is_full_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.userId,
        weekStart,
        input.startTimeIso,
        input.endTimeIso,
        input.priority,
        input.reason,
        input.sourceMessage,
        isFullDay,
      ],
    );
  },
};
