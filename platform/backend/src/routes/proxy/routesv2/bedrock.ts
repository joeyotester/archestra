import { RouteId } from "@shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import logger from "@/logging";
import { Bedrock, constructResponseSchema, UuidIdSchema } from "@/types";
import { bedrockAdapterFactory } from "../adapterV2";
import { PROXY_API_PREFIX, PROXY_BODY_LIMIT } from "../common";
import { handleLLMProxy } from "../llm-proxy-handler";
import * as utils from "../utils";

/** Mask sensitive credentials in headers for logging */
function maskSensitiveHeaders(headers: Bedrock.Types.ConverseHeaders) {
  return {
    ...headers,
    authorization: headers.authorization ? "***" : undefined,
  };
}

/**
 * Bedrock Converse API routes following native AWS API format.
 * Native Bedrock API: POST /model/{modelId}/converse
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
 */
const bedrockProxyRoutesV2: FastifyPluginAsyncZod = async (fastify) => {
  const BEDROCK_PREFIX = `${PROXY_API_PREFIX}/bedrock`;

  logger.info("[UnifiedProxy] Registering unified Amazon Bedrock routes");

  /**
   * Bedrock Converse API with agent and model ID in path
   * POST /v1/bedrock/:agentId/model/:modelId/converse
   * POST /v1/bedrock/:agentId/model/:modelId/converse-stream
   */
  fastify.post(
    `${BEDROCK_PREFIX}/:agentId/model/:modelId/:action(converse|converse-stream)`,
    {
      bodyLimit: PROXY_BODY_LIMIT,
      schema: {
        operationId: RouteId.BedrockConverseWithAgent,
        description:
          "Send a message to Amazon Bedrock with agent and model ID in path",
        tags: ["llm-proxy"],
        params: z.object({
          agentId: UuidIdSchema,
          modelId: z.string(),
          action: z.enum(["converse", "converse-stream"]),
        }),
        body: Bedrock.API.ConverseRequestSchema.omit({ modelId: true }),
        headers: Bedrock.API.ConverseHeadersSchema,
        response: constructResponseSchema(Bedrock.API.ConverseResponseSchema),
      },
    },
    async (request, reply) => {
      const body = request.body as Bedrock.Types.ConverseRequest;
      const agentId = request.params.agentId;
      const modelId = decodeURIComponent(request.params.modelId);
      const action = request.params.action;
      const stream = action === "converse-stream";
      const headers = request.headers as Bedrock.Types.ConverseHeaders;

      logger.info(
        {
          url: request.url,
          agentId,
          modelId,
          stream,
          headers: maskSensitiveHeaders(headers),
          bodyKeys: Object.keys(body || {}),
        },
        "[UnifiedProxy] Handling Bedrock request",
      );

      const externalAgentId = utils.externalAgentId.getExternalAgentId(headers);
      const userId = await utils.userId.getUserId(headers);

      const finalBody = { ...body, modelId, stream };

      return handleLLMProxy(finalBody, headers, reply, bedrockAdapterFactory, {
        organizationId: request.organizationId,
        agentId,
        externalAgentId,
        userId,
      });
    },
  );

  /**
   * Bedrock Converse API with model ID in path (default agent)
   * POST /v1/bedrock/model/:modelId/converse
   * POST /v1/bedrock/model/:modelId/converse-stream
   */
  fastify.post(
    `${BEDROCK_PREFIX}/model/:modelId/:action(converse|converse-stream)`,
    {
      bodyLimit: PROXY_BODY_LIMIT,
      schema: {
        operationId: RouteId.BedrockConverseWithDefaultAgent,
        description: "Send a message to Amazon Bedrock with model ID in path",
        tags: ["llm-proxy"],
        params: z.object({
          modelId: z.string(),
          action: z.enum(["converse", "converse-stream"]),
        }),
        body: Bedrock.API.ConverseRequestSchema.omit({ modelId: true }),
        headers: Bedrock.API.ConverseHeadersSchema,
        response: constructResponseSchema(Bedrock.API.ConverseResponseSchema),
      },
    },
    async (request, reply) => {
      const body = request.body as Bedrock.Types.ConverseRequest;
      const modelId = decodeURIComponent(request.params.modelId);
      const action = request.params.action;
      const stream = action === "converse-stream";
      const headers = request.headers as Bedrock.Types.ConverseHeaders;

      logger.info(
        {
          url: request.url,
          modelId,
          stream,
          headers: maskSensitiveHeaders(headers),
          bodyKeys: Object.keys(body || {}),
        },
        "[UnifiedProxy] Handling Bedrock request",
      );

      const externalAgentId = utils.externalAgentId.getExternalAgentId(headers);
      const userId = await utils.userId.getUserId(headers);

      const finalBody = { ...body, modelId, stream };

      return handleLLMProxy(finalBody, headers, reply, bedrockAdapterFactory, {
        organizationId: request.organizationId,
        externalAgentId,
        userId,
      });
    },
  );
};

export default bedrockProxyRoutesV2;
