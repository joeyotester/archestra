import { z } from "zod";

import { InputSchema, OutputItemSchema } from "./messages";
import { ToolChoiceOptionSchema, ToolSchema } from "./tools";

/**
 * OpenAI Responses API Request/Response Definitions
 *
 * @see https://platform.openai.com/docs/api-reference/responses
 */

// =============================================================================
// USAGE
// =============================================================================

export const ResponsesUsageSchema = z
  .object({
    input_tokens: z.number().describe("Number of input tokens"),
    input_tokens_details: z
      .object({
        cached_tokens: z.number().optional(),
        text_tokens: z.number().optional(),
        image_tokens: z.number().optional(),
        audio_tokens: z.number().optional(),
      })
      .optional(),
    output_tokens: z.number().describe("Number of output tokens"),
    output_tokens_details: z
      .object({
        text_tokens: z.number().optional(),
        audio_tokens: z.number().optional(),
        reasoning_tokens: z.number().optional(),
      })
      .optional(),
    total_tokens: z.number().describe("Total tokens (input + output)"),
  })
  .describe("Token usage information");

// =============================================================================
// STATUS
// =============================================================================

export const ResponseStatusSchema = z.enum([
  "completed",
  "incomplete",
  "failed",
  "in_progress",
  "cancelled",
]);

export const IncompleteDetailsSchema = z
  .object({
    reason: z.enum([
      "max_output_tokens",
      "content_filter",
      "turn_limit_reached",
      "interrupted",
    ]),
  })
  .nullable()
  .optional()
  .describe("Details about why the response is incomplete");

// =============================================================================
// REASONING CONFIG
// =============================================================================

export const ReasoningConfigSchema = z
  .object({
    effort: z
      .enum(["low", "medium", "high"])
      .nullable()
      .optional()
      .describe("Effort level for reasoning"),
    generate_summary: z
      .enum(["auto", "concise", "detailed"])
      .nullable()
      .optional()
      .describe("Type of reasoning summary to generate"),
  })
  .describe("Configuration for reasoning models");

// =============================================================================
// TEXT CONFIG
// =============================================================================

export const TextConfigSchema = z
  .object({
    format: z
      .union([
        z.object({ type: z.literal("text") }),
        z.object({
          type: z.literal("json_schema"),
          name: z.string(),
          schema: z.record(z.string(), z.unknown()),
          strict: z.boolean().optional(),
        }),
        z.object({ type: z.literal("json_object") }),
      ])
      .optional()
      .describe("Format for text output"),
  })
  .describe("Configuration for text output");

// =============================================================================
// REQUEST
// =============================================================================

export const ResponsesRequestSchema = z
  .object({
    // Required
    model: z.string().describe("The model to use"),
    input: InputSchema.describe("The input to the model"),

    // Instructions (system prompt)
    instructions: z
      .string()
      .optional()
      .describe("System instructions for the model"),

    // Tools
    tools: z
      .array(ToolSchema)
      .optional()
      .describe("Tools available to the model"),
    tool_choice: ToolChoiceOptionSchema.optional(),
    parallel_tool_calls: z
      .boolean()
      .optional()
      .describe("Whether to allow parallel tool calls"),

    // Generation parameters
    temperature: z
      .number()
      .min(0)
      .max(2)
      .nullable()
      .optional()
      .describe("Sampling temperature"),
    top_p: z
      .number()
      .min(0)
      .max(1)
      .nullable()
      .optional()
      .describe("Nucleus sampling parameter"),
    max_output_tokens: z
      .number()
      .int()
      .nullable()
      .optional()
      .describe("Maximum tokens in the response"),

    // Streaming
    stream: z
      .boolean()
      .nullable()
      .optional()
      .describe("Whether to stream the response"),

    // State management
    previous_response_id: z
      .string()
      .optional()
      .describe("ID of a previous response for multi-turn conversations"),
    store: z
      .boolean()
      .optional()
      .describe("Whether to store the response for future reference"),

    // Output format
    text: TextConfigSchema.optional(),
    reasoning: ReasoningConfigSchema.optional(),

    // Truncation
    truncation: z
      .enum(["auto", "disabled"])
      .optional()
      .describe("Truncation strategy for context"),

    // Metadata
    metadata: z
      .record(z.string(), z.string())
      .optional()
      .describe("Custom metadata for the request"),

    // User identifier
    user: z.string().optional().describe("Unique identifier for the end user"),

    // Service tier
    service_tier: z
      .enum(["auto", "default", "flex"])
      .optional()
      .describe("Service tier for the request"),
  })
  .describe("OpenAI Responses API request");

// =============================================================================
// RESPONSE
// =============================================================================

export const ResponsesResponseSchema = z
  .object({
    id: z.string().describe("Unique ID of the response"),
    object: z.literal("response").describe("Object type"),
    created_at: z.number().describe("Unix timestamp of creation"),
    model: z.string().describe("Model used for the response"),
    status: ResponseStatusSchema.describe("Status of the response"),
    output: z.array(OutputItemSchema).describe("Output items from the model"),
    usage: ResponsesUsageSchema.optional().describe("Token usage"),
    incomplete_details: IncompleteDetailsSchema,
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .nullable()
      .optional()
      .describe("Error details if status is failed"),
    metadata: z
      .record(z.string(), z.string())
      .optional()
      .describe("Custom metadata from the request"),
    parallel_tool_calls: z.boolean().optional(),
    previous_response_id: z.string().nullable().optional(),
    service_tier: z.string().optional(),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    max_output_tokens: z.number().nullable().optional(),
    truncation: z.string().optional(),
    text: TextConfigSchema.optional(),
    reasoning: ReasoningConfigSchema.optional(),
    instructions: z.string().nullable().optional(),
    tools: z.array(ToolSchema).optional(),
    tool_choice: ToolChoiceOptionSchema.optional(),
  })
  .describe("OpenAI Responses API response");

// =============================================================================
// STREAMING EVENTS
// =============================================================================

export const ResponseCreatedEventSchema = z.object({
  type: z.literal("response.created"),
  response: ResponsesResponseSchema,
});

export const ResponseInProgressEventSchema = z.object({
  type: z.literal("response.in_progress"),
  response: ResponsesResponseSchema,
});

export const ResponseCompletedEventSchema = z.object({
  type: z.literal("response.completed"),
  response: ResponsesResponseSchema,
});

export const ResponseFailedEventSchema = z.object({
  type: z.literal("response.failed"),
  response: ResponsesResponseSchema,
});

export const ResponseIncompleteEventSchema = z.object({
  type: z.literal("response.incomplete"),
  response: ResponsesResponseSchema,
});

export const OutputItemAddedEventSchema = z.object({
  type: z.literal("response.output_item.added"),
  output_index: z.number(),
  item: OutputItemSchema,
});

export const OutputItemDoneEventSchema = z.object({
  type: z.literal("response.output_item.done"),
  output_index: z.number(),
  item: OutputItemSchema,
});

export const ContentPartAddedEventSchema = z.object({
  type: z.literal("response.content_part.added"),
  output_index: z.number(),
  content_index: z.number(),
  part: z.object({
    type: z.string(),
    text: z.string().optional(),
    annotations: z.array(z.unknown()).optional(),
  }),
});

export const ContentPartDoneEventSchema = z.object({
  type: z.literal("response.content_part.done"),
  output_index: z.number(),
  content_index: z.number(),
  part: z.object({
    type: z.string(),
    text: z.string().optional(),
    annotations: z.array(z.unknown()).optional(),
  }),
});

export const TextDeltaEventSchema = z.object({
  type: z.literal("response.output_text.delta"),
  output_index: z.number(),
  content_index: z.number(),
  delta: z.string(),
});

export const TextDoneEventSchema = z.object({
  type: z.literal("response.output_text.done"),
  output_index: z.number(),
  content_index: z.number(),
  text: z.string(),
});

export const FunctionCallArgumentsDeltaEventSchema = z.object({
  type: z.literal("response.function_call_arguments.delta"),
  output_index: z.number(),
  call_id: z.string(),
  delta: z.string(),
});

export const FunctionCallArgumentsDoneEventSchema = z.object({
  type: z.literal("response.function_call_arguments.done"),
  output_index: z.number(),
  call_id: z.string(),
  arguments: z.string(),
});

export const RefusalDeltaEventSchema = z.object({
  type: z.literal("response.refusal.delta"),
  output_index: z.number(),
  content_index: z.number(),
  delta: z.string(),
});

export const RefusalDoneEventSchema = z.object({
  type: z.literal("response.refusal.done"),
  output_index: z.number(),
  content_index: z.number(),
  refusal: z.string(),
});

export const FileSearchCallInProgressEventSchema = z.object({
  type: z.literal("response.file_search_call.in_progress"),
  output_index: z.number(),
  item_id: z.string(),
});

export const FileSearchCallSearchingEventSchema = z.object({
  type: z.literal("response.file_search_call.searching"),
  output_index: z.number(),
  item_id: z.string(),
});

export const FileSearchCallCompletedEventSchema = z.object({
  type: z.literal("response.file_search_call.completed"),
  output_index: z.number(),
  item_id: z.string(),
});

export const WebSearchCallInProgressEventSchema = z.object({
  type: z.literal("response.web_search_call.in_progress"),
  output_index: z.number(),
  item_id: z.string(),
});

export const WebSearchCallSearchingEventSchema = z.object({
  type: z.literal("response.web_search_call.searching"),
  output_index: z.number(),
  item_id: z.string(),
});

export const WebSearchCallCompletedEventSchema = z.object({
  type: z.literal("response.web_search_call.completed"),
  output_index: z.number(),
  item_id: z.string(),
});

export const CodeInterpreterCallInProgressEventSchema = z.object({
  type: z.literal("response.code_interpreter_call.in_progress"),
  output_index: z.number(),
  item_id: z.string(),
});

export const CodeInterpreterCallInterpretingEventSchema = z.object({
  type: z.literal("response.code_interpreter_call.interpreting"),
  output_index: z.number(),
  item_id: z.string(),
});

export const CodeInterpreterCallCompletedEventSchema = z.object({
  type: z.literal("response.code_interpreter_call.completed"),
  output_index: z.number(),
  item_id: z.string(),
});

export const ReasoningSummaryPartAddedEventSchema = z.object({
  type: z.literal("response.reasoning_summary_part.added"),
  output_index: z.number(),
  summary_index: z.number(),
  part: z.object({
    type: z.literal("summary_text"),
    text: z.string(),
  }),
});

export const ReasoningSummaryPartDoneEventSchema = z.object({
  type: z.literal("response.reasoning_summary_part.done"),
  output_index: z.number(),
  summary_index: z.number(),
  part: z.object({
    type: z.literal("summary_text"),
    text: z.string(),
  }),
});

export const ReasoningSummaryTextDeltaEventSchema = z.object({
  type: z.literal("response.reasoning_summary_text.delta"),
  output_index: z.number(),
  summary_index: z.number(),
  delta: z.string(),
});

export const ReasoningSummaryTextDoneEventSchema = z.object({
  type: z.literal("response.reasoning_summary_text.done"),
  output_index: z.number(),
  summary_index: z.number(),
  text: z.string(),
});

export const ErrorEventSchema = z.object({
  type: z.literal("error"),
  code: z.string().optional(),
  message: z.string(),
  param: z.string().nullable().optional(),
});

export const ResponseStreamEventSchema = z.union([
  ResponseCreatedEventSchema,
  ResponseInProgressEventSchema,
  ResponseCompletedEventSchema,
  ResponseFailedEventSchema,
  ResponseIncompleteEventSchema,
  OutputItemAddedEventSchema,
  OutputItemDoneEventSchema,
  ContentPartAddedEventSchema,
  ContentPartDoneEventSchema,
  TextDeltaEventSchema,
  TextDoneEventSchema,
  FunctionCallArgumentsDeltaEventSchema,
  FunctionCallArgumentsDoneEventSchema,
  RefusalDeltaEventSchema,
  RefusalDoneEventSchema,
  FileSearchCallInProgressEventSchema,
  FileSearchCallSearchingEventSchema,
  FileSearchCallCompletedEventSchema,
  WebSearchCallInProgressEventSchema,
  WebSearchCallSearchingEventSchema,
  WebSearchCallCompletedEventSchema,
  CodeInterpreterCallInProgressEventSchema,
  CodeInterpreterCallInterpretingEventSchema,
  CodeInterpreterCallCompletedEventSchema,
  ReasoningSummaryPartAddedEventSchema,
  ReasoningSummaryPartDoneEventSchema,
  ReasoningSummaryTextDeltaEventSchema,
  ReasoningSummaryTextDoneEventSchema,
  ErrorEventSchema,
]);

// =============================================================================
// HEADERS
// =============================================================================

export const ResponsesHeadersSchema = z.object({
  "user-agent": z.string().optional().describe("The user agent of the client"),
  authorization: z
    .string()
    .describe("Bearer token for OpenAI")
    .transform((authorization) => authorization.replace("Bearer ", "")),
});
