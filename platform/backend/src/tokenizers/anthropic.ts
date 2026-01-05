import { countTokens } from "@anthropic-ai/tokenizer";
import { BaseTokenizer, type ProviderMessage } from "./base";

/**
 * Anthropic's official tokenizer. Use for approximation before sending a request.
 * For exact token count, see token usage info in the LLM response.
 */
export class AnthropicTokenizer extends BaseTokenizer {
  countMessageTokens(message: ProviderMessage): number {
    const text = this.getMessageText(message);
    // Some message types (like ItemReference) don't have a role property
    const role = "role" in message ? message.role : "";
    return countTokens(`${role || ""}${text}`);
  }
}
