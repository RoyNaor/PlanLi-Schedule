import dotenv from "dotenv";
import OpenAI from "openai";
import { ConversationRepository } from "../repositories/conversation.repository";
import { int } from "zod";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ChatResponse {
  id: string;
  output_text: string;
}

export const ChatService = {

  async sendMessage(message: string, conversationId: string) : Promise<ChatResponse> {
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: message,
      temperature: 0.5,
      max_output_tokens: 100,
      previous_response_id: ConversationRepository.getLastResponseId(conversationId)
    });

    ConversationRepository.setLastResponseId(conversationId, response.id);

    return {
      id: response.id,
      output_text: response.output_text
    };
  }

}