import type { archestraApiTypes } from "@shared";
import type { PartialUIMessage } from "@/components/chatbot-demo";
import type { DualLlmResult, Interaction, InteractionUtils } from "./common";

// Type aliases for cleaner code
type ResponsesRequest = archestraApiTypes.OpenAiResponsesRequest;
type ResponsesResponse = archestraApiTypes.OpenAiResponsesResponse;
type InputItem =
  NonNullable<ResponsesRequest["input"]> extends infer T
    ? T extends Array<infer U>
      ? U
      : never
    : never;
type OutputItem = ResponsesResponse["output"][number];

// Type guards for input items
function isMessageItem(
  item: InputItem,
): item is InputItem & { role: string; content: unknown } {
  return item.type === "message" || !item.type;
}

function isFunctionCallOutputItem(item: InputItem): item is InputItem & {
  type: "function_call_output";
  call_id: string;
  output: string;
} {
  return item.type === "function_call_output";
}

// Type guards for output items
function isOutputMessageItem(item: OutputItem): item is OutputItem & {
  type: "message";
  role: string;
  content: Array<{ type: string; text?: string; refusal?: string }>;
} {
  return item.type === "message";
}

function isFunctionCallItem(item: OutputItem): item is OutputItem & {
  type: "function_call";
  name: string;
  call_id: string;
  arguments: string;
} {
  return item.type === "function_call";
}

/**
 * OpenAI Responses API interaction handler for the LLM Proxy Logs UI
 *
 * The Responses API uses a different structure than Chat Completions:
 * - Input: string | InputItem[] (messages, function_call_output, etc.)
 * - Output: OutputItem[] (message, function_call, etc.)
 */
class OpenAiResponsesInteraction implements InteractionUtils {
  private request: ResponsesRequest;
  private response: ResponsesResponse;
  modelName: string;

  constructor(interaction: Interaction) {
    this.request = interaction.request as ResponsesRequest;
    this.response = interaction.response as ResponsesResponse;
    this.modelName = interaction.model ?? this.request.model;
  }

  isLastMessageToolCall(): boolean {
    const input = this.request.input;

    if (typeof input === "string" || !Array.isArray(input)) {
      return false;
    }

    if (input.length === 0) {
      return false;
    }

    const lastItem = input[input.length - 1];
    return isFunctionCallOutputItem(lastItem);
  }

  getLastToolCallId(): string | null {
    const input = this.request.input;

    if (typeof input === "string" || !Array.isArray(input)) {
      return null;
    }

    if (input.length === 0) {
      return null;
    }

    const lastItem = input[input.length - 1];
    if (isFunctionCallOutputItem(lastItem)) {
      return lastItem.call_id;
    }
    return null;
  }

  getToolNamesUsed(): string[] {
    const toolsUsed = new Set<string>();

    // In Responses API, function calls from previous turns are tracked by
    // looking at function_call_output items (they respond to previous function calls)
    // However, the function name is not in function_call_output, so we need to
    // track from request tools or response function_calls
    for (const item of this.response.output) {
      if (isFunctionCallItem(item)) {
        toolsUsed.add(item.name);
      }
    }

    return Array.from(toolsUsed);
  }

  getToolNamesRefused(): string[] {
    const toolsRefused = new Set<string>();

    // Check output for refusal messages that mention tool names
    for (const item of this.response.output) {
      if (isOutputMessageItem(item)) {
        for (const contentPart of item.content) {
          if (contentPart.type === "refusal" && contentPart.refusal) {
            const toolName = contentPart.refusal.match(
              /<archestra-tool-name>(.*?)<\/archestra-tool-name>/,
            )?.[1];
            if (toolName) {
              toolsRefused.add(toolName);
            }
          }
          if (contentPart.type === "output_text" && contentPart.text) {
            const toolName = contentPart.text.match(
              /<archestra-tool-name>(.*?)<\/archestra-tool-name>/,
            )?.[1];
            if (toolName) {
              toolsRefused.add(toolName);
            }
          }
        }
      }
    }

    return Array.from(toolsRefused);
  }

  getToolNamesRequested(): string[] {
    const toolsRequested = new Set<string>();

    // Check the response for function calls (tools that LLM wants to execute)
    for (const item of this.response.output) {
      if (isFunctionCallItem(item)) {
        toolsRequested.add(item.name);
      }
    }

    return Array.from(toolsRequested);
  }

  getLastUserMessage(): string {
    const input = this.request.input;

    if (typeof input === "string") {
      return input;
    }

    if (!Array.isArray(input)) {
      return "";
    }

    // Find the last user message
    const reversedInput = [...input].reverse();
    for (const item of reversedInput) {
      if (isMessageItem(item) && item.role === "user") {
        const content = item.content;
        if (typeof content === "string") {
          return content;
        }
        if (Array.isArray(content)) {
          const textPart = content.find(
            (p: { type: string; text?: string }) => p.type === "input_text",
          );
          if (
            textPart &&
            "text" in textPart &&
            typeof textPart.text === "string"
          ) {
            return textPart.text;
          }
        }
      }
    }

    return "";
  }

  getLastAssistantResponse(): string {
    // Find the last message output with text content
    for (const item of [...this.response.output].reverse()) {
      if (isOutputMessageItem(item) && item.role === "assistant") {
        for (const contentPart of item.content) {
          if (contentPart.type === "output_text" && contentPart.text) {
            return contentPart.text;
          }
        }
      }
    }
    return "";
  }

  getToolRefusedCount(): number {
    let count = 0;

    for (const item of this.response.output) {
      if (isOutputMessageItem(item)) {
        for (const contentPart of item.content) {
          if (contentPart.type === "refusal") {
            count++;
          }
          // Also check for policy denial markers in text content
          if (
            contentPart.type === "output_text" &&
            contentPart.text?.includes("<archestra-tool-name>")
          ) {
            count++;
          }
        }
      }
    }

    return count;
  }

  private mapInputItemToUiMessage(item: InputItem): PartialUIMessage | null {
    const parts: PartialUIMessage["parts"] = [];

    if (isMessageItem(item)) {
      // Handle message items
      const content = item.content;

      if (typeof content === "string") {
        parts.push({ type: "text", text: content });
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (
            part.type === "input_text" &&
            "text" in part &&
            typeof part.text === "string"
          ) {
            parts.push({ type: "text", text: part.text });
          }
        }
      }

      const role =
        item.role === "user"
          ? "user"
          : item.role === "assistant"
            ? "assistant"
            : "system";

      return { role, parts };
    }

    if (isFunctionCallOutputItem(item)) {
      // Handle function call output (tool result)
      let output: unknown;
      try {
        output = JSON.parse(item.output);
      } catch {
        output = item.output;
      }

      parts.push({
        type: "dynamic-tool",
        toolName: "tool-result",
        toolCallId: item.call_id,
        state: "output-available",
        input: {},
        output,
      });

      return { role: "assistant", parts };
    }

    return null;
  }

  private mapOutputItemToUiMessage(item: OutputItem): PartialUIMessage | null {
    const parts: PartialUIMessage["parts"] = [];

    if (isOutputMessageItem(item)) {
      for (const contentPart of item.content) {
        if (contentPart.type === "output_text" && contentPart.text) {
          parts.push({ type: "text", text: contentPart.text });
        } else if (contentPart.type === "refusal" && contentPart.refusal) {
          parts.push({ type: "text", text: contentPart.refusal });
        }
      }
      return { role: "assistant", parts };
    }

    if (isFunctionCallItem(item)) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(item.arguments);
      } catch {
        args = {};
      }

      parts.push({
        type: "dynamic-tool",
        toolName: item.name,
        toolCallId: item.call_id,
        state: "input-available",
        input: args,
      });

      return { role: "assistant", parts };
    }

    return null;
  }

  private mapRequestToUiMessages(
    dualLlmResults?: DualLlmResult[],
  ): PartialUIMessage[] {
    const input = this.request.input;
    const uiMessages: PartialUIMessage[] = [];

    if (typeof input === "string") {
      uiMessages.push({
        role: "user",
        parts: [{ type: "text", text: input }],
      });
      return uiMessages;
    }

    if (!Array.isArray(input)) {
      return uiMessages;
    }

    for (const item of input) {
      // Skip function_call_output items - they'll be added separately
      if (isFunctionCallOutputItem(item)) {
        continue;
      }

      const uiMessage = this.mapInputItemToUiMessage(item);
      if (uiMessage) {
        uiMessages.push(uiMessage);
      }
    }

    // Now process function_call_outputs and merge with dual LLM results
    for (const item of input) {
      if (isFunctionCallOutputItem(item)) {
        const toolResultMsg = this.mapInputItemToUiMessage(item);
        if (toolResultMsg) {
          // Check for dual LLM result
          const dualLlmResultForTool = dualLlmResults?.find(
            (result) => result.toolCallId === item.call_id,
          );

          if (dualLlmResultForTool) {
            toolResultMsg.parts.push({
              type: "dual-llm-analysis",
              toolCallId: dualLlmResultForTool.toolCallId,
              safeResult: dualLlmResultForTool.result,
              conversations: Array.isArray(dualLlmResultForTool.conversations)
                ? (dualLlmResultForTool.conversations as Array<{
                    role: "user" | "assistant";
                    content: string | unknown;
                  }>)
                : [],
            });
          }

          uiMessages.push(toolResultMsg);
        }
      }
    }

    return uiMessages;
  }

  private mapResponseToUiMessages(): PartialUIMessage[] {
    const uiMessages: PartialUIMessage[] = [];

    for (const item of this.response.output) {
      const uiMessage = this.mapOutputItemToUiMessage(item);
      if (uiMessage) {
        uiMessages.push(uiMessage);
      }
    }

    return uiMessages;
  }

  mapToUiMessages(dualLlmResults?: DualLlmResult[]): PartialUIMessage[] {
    return [
      ...this.mapRequestToUiMessages(dualLlmResults),
      ...this.mapResponseToUiMessages(),
    ];
  }
}

export default OpenAiResponsesInteraction;
