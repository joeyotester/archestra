import type { Anthropic, Gemini, OpenAi, OpenAiResponses } from "@/types";

export type ProviderMessage =
  | OpenAi.Types.ChatCompletionsRequest["messages"][number]
  | OpenAiResponses.Types.InputItem
  | Anthropic.Types.MessagesRequest["messages"][number]
  | Gemini.Types.GenerateContentRequest["contents"][number];

/**
 * Base interface for tokenizers
 * Provides a unified way to count tokens across different providers
 */
export interface Tokenizer {
  /**
   * Count tokens in messages (array, single message, or string)
   * String input is supported for OpenAI Responses API
   */
  countTokens(messages: ProviderMessage[] | ProviderMessage | string): number;
}

/**
 * Abstract base class for tokenizers.
 * These tokenizers are approximate.
 * E.g. they are used to estimate token count before sending an LLM request.
 *
 * To get exact token count for stats and costs, see token usage in LLM response.
 */
export abstract class BaseTokenizer implements Tokenizer {
  countMessageTokens(message: ProviderMessage): number {
    const text = this.getMessageText(message);
    return Math.ceil(text.length / 4);
  }

  countTokens(messages: ProviderMessage[] | ProviderMessage | string): number {
    // Handle string input (OpenAI Responses API supports string input)
    if (typeof messages === "string") {
      return Math.ceil(messages.length / 4);
    }

    if (Array.isArray(messages)) {
      const total = messages.reduce((sum, message) => {
        return sum + this.countMessageTokens(message);
      }, 0);
      return total;
    } else {
      return this.countMessageTokens(messages);
    }
  }

  /**
   * Extract text content from a message, which can be a string or a collection of objects
   */
  protected getMessageText(message: ProviderMessage): string {
    // OpenAI/Anthropic format: content property
    if ("content" in message) {
      if (typeof message.content === "string") {
        return message.content;
      }

      if (Array.isArray(message.content)) {
        const text = message.content.reduce((text, block) => {
          if (block.type === "text" && typeof block.text === "string") {
            text += block.text;
          }
          return text;
        }, "");

        return text;
      }
    }

    // OpenAI Responses API: function_call_output format (has output instead of content)
    if ("output" in message && typeof message.output === "string") {
      return message.output;
    }

    // Gemini format: parts property
    if ("parts" in message && Array.isArray(message.parts)) {
      const text = message.parts.reduce((text, part) => {
        if ("text" in part && typeof part.text === "string") {
          text += part.text;
        }
        // Handle function call/response by serializing args/response
        if (
          "functionCall" in part &&
          part.functionCall &&
          typeof part.functionCall === "object"
        ) {
          const fc = part.functionCall;
          text += `function_call:${fc.name || "unknown"}(${JSON.stringify(fc.args || {})})`;
        }
        if (
          "functionResponse" in part &&
          part.functionResponse &&
          typeof part.functionResponse === "object"
        ) {
          const fr = part.functionResponse;
          text += `function_response:${fr.name || "unknown"}(${JSON.stringify(fr.response || {})})`;
        }
        return text;
      }, "");

      return text;
    }

    return "";
  }
}
