import { z } from "zod";

/**
 * OpenAI Responses API Message/Item Definitions
 *
 * The Responses API uses "Items" instead of "Messages".
 * Input can be a string or an array of input items.
 * Output is an array of output items.
 *
 * @see https://platform.openai.com/docs/api-reference/responses
 */

// =============================================================================
// CONTENT PARTS (for input items)
// =============================================================================

export const InputTextContentSchema = z
  .object({
    type: z.literal("input_text"),
    text: z.string().describe("The text content"),
  })
  .describe("Text content for input");

export const InputImageContentSchema = z
  .object({
    type: z.literal("input_image"),
    image_url: z
      .string()
      .optional()
      .describe("URL of the image (can be data: URL for base64)"),
    file_id: z.string().optional().describe("File ID of an uploaded image"),
    detail: z
      .enum(["auto", "low", "high"])
      .optional()
      .describe("Detail level for image analysis"),
  })
  .describe("Image content for input");

export const InputAudioContentSchema = z
  .object({
    type: z.literal("input_audio"),
    data: z.string().describe("Base64-encoded audio data"),
    format: z.enum(["wav", "mp3"]).describe("Audio format"),
  })
  .describe("Audio content for input");

export const InputFileContentSchema = z
  .object({
    type: z.literal("input_file"),
    file_id: z.string().optional().describe("File ID of an uploaded file"),
    file_data: z.string().optional().describe("Base64-encoded file data"),
    filename: z.string().optional().describe("Name of the file"),
  })
  .describe("File content for input");

export const InputContentPartSchema = z.union([
  InputTextContentSchema,
  InputImageContentSchema,
  InputAudioContentSchema,
  InputFileContentSchema,
]);

// =============================================================================
// INPUT ITEMS
// =============================================================================

export const EasyInputMessageSchema = z
  .object({
    type: z.literal("message").optional(),
    role: z.enum(["user", "assistant", "system", "developer"]),
    content: z.union([z.string(), z.array(InputContentPartSchema)]),
  })
  .describe("A message in easy input format (similar to chat completions)");

export const InputMessageSchema = z
  .object({
    type: z.literal("message"),
    role: z.enum(["user", "assistant", "system", "developer"]),
    content: z.union([z.string(), z.array(InputContentPartSchema)]),
    id: z.string().optional().describe("Optional ID for the message"),
  })
  .describe("A message input item");

export const ItemReferenceSchema = z
  .object({
    type: z.literal("item_reference"),
    id: z.string().describe("ID of the item to reference"),
  })
  .describe("Reference to a previous item by ID");

export const FunctionCallOutputSchema = z
  .object({
    type: z.literal("function_call_output"),
    call_id: z
      .string()
      .describe("ID of the function call this is responding to"),
    output: z.string().describe("The output/result of the function call"),
  })
  .describe("Output from a function call (for multi-turn conversations)");

export const InputItemSchema = z.union([
  EasyInputMessageSchema,
  InputMessageSchema,
  ItemReferenceSchema,
  FunctionCallOutputSchema,
]);

// =============================================================================
// OUTPUT CONTENT PARTS
// =============================================================================

export const OutputTextContentSchema = z
  .object({
    type: z.literal("output_text"),
    text: z.string().describe("The text content"),
    annotations: z
      .array(
        z.object({
          type: z.enum(["file_citation", "url_citation", "file_path"]),
          start_index: z.number().optional(),
          end_index: z.number().optional(),
          file_citation: z
            .object({
              file_id: z.string(),
              quote: z.string().optional(),
            })
            .optional(),
          url_citation: z
            .object({
              url: z.string(),
              title: z.string().optional(),
            })
            .optional(),
          file_path: z
            .object({
              file_id: z.string(),
            })
            .optional(),
        }),
      )
      .optional()
      .describe("Annotations with citations and references"),
  })
  .describe("Text content in output");

export const RefusalContentSchema = z
  .object({
    type: z.literal("refusal"),
    refusal: z.string().describe("The refusal message"),
  })
  .describe("Refusal content when the model declines to respond");

export const OutputContentPartSchema = z.union([
  OutputTextContentSchema,
  RefusalContentSchema,
]);

// =============================================================================
// OUTPUT ITEMS
// =============================================================================

export const OutputMessageSchema = z
  .object({
    type: z.literal("message"),
    id: z.string().describe("Unique ID of this output item"),
    role: z.literal("assistant"),
    status: z.enum(["in_progress", "completed", "incomplete"]),
    content: z.array(OutputContentPartSchema),
  })
  .describe("A message output from the assistant");

export const FunctionCallSchema = z
  .object({
    type: z.literal("function_call"),
    id: z.string().describe("Unique ID of this function call"),
    call_id: z.string().describe("ID to use when providing function output"),
    name: z.string().describe("Name of the function to call"),
    arguments: z.string().describe("JSON string of function arguments"),
    status: z.enum(["in_progress", "completed", "incomplete"]),
  })
  .describe("A function call the model wants to make");

export const FileSearchCallSchema = z
  .object({
    type: z.literal("file_search_call"),
    id: z.string(),
    status: z.enum([
      "in_progress",
      "completed",
      "incomplete",
      "searching",
      "failed",
    ]),
    queries: z.array(z.string()).optional(),
    results: z
      .array(
        z.object({
          file_id: z.string(),
          filename: z.string(),
          score: z.number(),
          text: z.string(),
          attributes: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .optional()
      .nullable(),
  })
  .describe("A file search call and its results");

export const WebSearchCallSchema = z
  .object({
    type: z.literal("web_search_call"),
    id: z.string(),
    status: z.enum([
      "in_progress",
      "completed",
      "incomplete",
      "searching",
      "failed",
    ]),
  })
  .describe("A web search call");

export const CodeInterpreterCallSchema = z
  .object({
    type: z.literal("code_interpreter_call"),
    id: z.string(),
    status: z.enum(["in_progress", "completed", "incomplete"]),
    code: z.string().optional(),
    results: z
      .array(
        z.union([
          z.object({
            type: z.literal("logs"),
            logs: z.string(),
          }),
          z.object({
            type: z.literal("image"),
            image: z.object({
              file_id: z.string(),
            }),
          }),
          z.object({
            type: z.literal("files"),
            files: z.array(
              z.object({
                file_id: z.string(),
                mime_type: z.string().optional(),
              }),
            ),
          }),
        ]),
      )
      .optional(),
  })
  .describe("A code interpreter call and its results");

export const ComputerCallSchema = z
  .object({
    type: z.literal("computer_call"),
    id: z.string(),
    call_id: z.string(),
    status: z.enum(["in_progress", "completed", "incomplete"]),
    action: z.object({
      type: z.enum([
        "click",
        "double_click",
        "drag",
        "keypress",
        "move",
        "screenshot",
        "scroll",
        "type",
        "wait",
      ]),
      coordinate: z.tuple([z.number(), z.number()]).optional(),
      end_coordinate: z.tuple([z.number(), z.number()]).optional(),
      button: z.enum(["left", "right", "middle", "wheel"]).optional(),
      keys: z.array(z.string()).optional(),
      text: z.string().optional(),
      scroll_direction: z.enum(["up", "down", "left", "right"]).optional(),
      scroll_amount: z.number().optional(),
      duration: z.number().optional(),
    }),
    pending_safety_checks: z
      .array(
        z.object({
          id: z.string(),
          code: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  })
  .describe("A computer use call");

export const ReasoningSchema = z
  .object({
    type: z.literal("reasoning"),
    id: z.string(),
    summary: z.array(
      z.object({
        type: z.literal("summary_text"),
        text: z.string(),
      }),
    ),
  })
  .describe("Reasoning output from reasoning models (o1, etc.)");

export const McpCallSchema = z
  .object({
    type: z.literal("mcp_call"),
    id: z.string(),
    approval_request_id: z.string().optional(),
    server_label: z.string(),
    name: z.string(),
    arguments: z.string(),
    error: z.string().optional(),
    output: z.string().optional(),
  })
  .describe("An MCP tool call");

export const McpListToolsSchema = z
  .object({
    type: z.literal("mcp_list_tools"),
    id: z.string(),
    server_label: z.string(),
    tools: z.array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        input_schema: z.record(z.string(), z.unknown()),
      }),
    ),
  })
  .describe("List of tools from an MCP server");

export const McpApprovalRequestSchema = z
  .object({
    type: z.literal("mcp_approval_request"),
    id: z.string(),
    server_label: z.string(),
    name: z.string(),
    arguments: z.string(),
  })
  .describe("An MCP approval request");

export const OutputItemSchema = z.union([
  OutputMessageSchema,
  FunctionCallSchema,
  FileSearchCallSchema,
  WebSearchCallSchema,
  CodeInterpreterCallSchema,
  ComputerCallSchema,
  ReasoningSchema,
  McpCallSchema,
  McpListToolsSchema,
  McpApprovalRequestSchema,
]);

// =============================================================================
// COMBINED INPUT TYPE
// =============================================================================

export const InputSchema = z.union([z.string(), z.array(InputItemSchema)]);
