import { z } from "zod";

/**
 * OpenAI Responses API Tool Definitions
 *
 * The Responses API uses a flatter tool structure compared to Chat Completions.
 * It also includes built-in tools like web_search, file_search, and code_interpreter.
 *
 * @see https://platform.openai.com/docs/api-reference/responses
 */

// =============================================================================
// FUNCTION TOOL
// =============================================================================

export const FunctionDefinitionParametersSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(`
    The parameters the function accepts, described as a JSON Schema object.
    Omitting parameters defines a function with an empty parameter list.
  `);

export const FunctionToolSchema = z
  .object({
    type: z.literal("function"),
    name: z.string().describe("The name of the function to call"),
    description: z
      .string()
      .optional()
      .describe("A description of what the function does"),
    parameters: FunctionDefinitionParametersSchema,
    strict: z
      .boolean()
      .nullable()
      .optional()
      .describe("Whether to enable strict schema adherence"),
  })
  .describe("A function tool definition for the Responses API");

// =============================================================================
// BUILT-IN TOOLS
// =============================================================================

export const WebSearchToolSchema = z
  .object({
    type: z.literal("web_search"),
    search_context_size: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe("How much context to include in web search results"),
    user_location: z
      .object({
        type: z.literal("approximate"),
        city: z.string().optional(),
        country: z.string().optional(),
        region: z.string().optional(),
        timezone: z.string().optional(),
      })
      .optional()
      .describe("Approximate location of the user for search context"),
  })
  .describe("Web search tool for searching the internet");

export const FileSearchToolSchema = z
  .object({
    type: z.literal("file_search"),
    vector_store_ids: z
      .array(z.string())
      .describe("IDs of vector stores to search"),
    max_num_results: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum number of results to return (1-50)"),
    ranking_options: z
      .object({
        ranker: z.enum(["auto", "default_2024_08_21"]).optional(),
        score_threshold: z.number().min(0).max(1).optional(),
      })
      .optional()
      .describe("Options for ranking search results"),
    filters: z
      .object({
        type: z.enum([
          "eq",
          "ne",
          "gt",
          "gte",
          "lt",
          "lte",
          "in",
          "nin",
          "and",
          "or",
        ]),
        key: z.string().optional(),
        value: z.unknown().optional(),
        filters: z.array(z.lazy(() => z.unknown())).optional(),
      })
      .optional()
      .describe("Filters to apply to search results"),
  })
  .describe("File search tool for searching vector stores");

export const CodeInterpreterToolSchema = z
  .object({
    type: z.literal("code_interpreter"),
    container: z
      .object({
        type: z.literal("auto"),
        file_ids: z.array(z.string()).optional(),
      })
      .optional()
      .describe("Container configuration for code interpreter"),
  })
  .describe("Code interpreter tool for executing code");

export const ComputerUseToolSchema = z
  .object({
    type: z.literal("computer_use_preview"),
    display_width: z.number().int().describe("Width of the display in pixels"),
    display_height: z
      .number()
      .int()
      .describe("Height of the display in pixels"),
    environment: z
      .enum(["browser", "mac", "windows", "ubuntu"])
      .describe("The environment for computer use"),
  })
  .describe("Computer use tool for controlling a computer");

// =============================================================================
// MCP TOOL
// =============================================================================

export const McpToolSchema = z
  .object({
    type: z.literal("mcp"),
    server_label: z.string().describe("Label for the MCP server"),
    server_url: z.string().url().describe("URL of the MCP server"),
    require_approval: z
      .enum(["always", "never"])
      .optional()
      .describe("Whether to require approval for tool calls"),
    allowed_tools: z
      .array(z.string())
      .optional()
      .describe("List of allowed tool names from this server"),
    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe("Headers to include in requests to the MCP server"),
  })
  .describe("MCP tool for connecting to Model Context Protocol servers");

// =============================================================================
// COMBINED TOOL SCHEMA
// =============================================================================

export const ToolSchema = z
  .union([
    FunctionToolSchema,
    WebSearchToolSchema,
    FileSearchToolSchema,
    CodeInterpreterToolSchema,
    ComputerUseToolSchema,
    McpToolSchema,
  ])
  .describe("A tool definition for the Responses API");

// =============================================================================
// TOOL CHOICE
// =============================================================================

export const FunctionToolChoiceSchema = z
  .object({
    type: z.literal("function"),
    name: z.string().describe("The name of the function to call"),
  })
  .describe("Force the model to call a specific function");

export const HostedToolChoiceSchema = z
  .object({
    type: z.enum([
      "file_search",
      "web_search",
      "code_interpreter",
      "computer_use_preview",
    ]),
  })
  .describe("Force the model to use a specific hosted tool");

export const ToolChoiceOptionSchema = z
  .union([
    z.literal("none").describe("Do not use any tools"),
    z.literal("auto").describe("Let the model decide which tools to use"),
    z.literal("required").describe("Model must use at least one tool"),
    FunctionToolChoiceSchema,
    HostedToolChoiceSchema,
  ])
  .describe("Controls which tools the model can use");
