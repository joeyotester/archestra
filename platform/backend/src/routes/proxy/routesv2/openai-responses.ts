import fastifyHttpProxy from "@fastify/http-proxy";
import { RouteId } from "@shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import config from "@/config";
import logger from "@/logging";
import {
  constructResponseSchema,
  OpenAiResponses,
  UuidIdSchema,
} from "@/types";
import { openaiResponsesAdapterFactory } from "../adapterV2";
import { PROXY_API_PREFIX, PROXY_BODY_LIMIT } from "../common";
import { handleLLMProxy } from "../llm-proxy-handler";
import * as utils from "../utils";

const openAiResponsesProxyRoutesV2: FastifyPluginAsyncZod = async (fastify) => {
  const API_PREFIX = `${PROXY_API_PREFIX}/openai-responses`;
  const RESPONSES_SUFFIX = "/responses";

  logger.info("[UnifiedProxy] Registering unified OpenAI Responses API routes");

  await fastify.register(fastifyHttpProxy, {
    upstream: config.llm.openai.baseUrl,
    prefix: API_PREFIX,
    rewritePrefix: "",
    preHandler: (request, _reply, next) => {
      if (request.method === "POST" && request.url.includes(RESPONSES_SUFFIX)) {
        logger.info(
          {
            method: request.method,
            url: request.url,
            action: "skip-proxy",
            reason: "handled-by-custom-handler",
          },
          "OpenAI Responses proxy preHandler: skipping responses route",
        );
        next(new Error("skip"));
        return;
      }

      const pathAfterPrefix = request.url.replace(API_PREFIX, "");
      const uuidMatch = pathAfterPrefix.match(
        /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/.*)?$/i,
      );

      if (uuidMatch) {
        const remainingPath = uuidMatch[2] || "";
        const originalUrl = request.raw.url;
        request.raw.url = `${API_PREFIX}${remainingPath}`;

        logger.info(
          {
            method: request.method,
            originalUrl,
            rewrittenUrl: request.raw.url,
            upstream: config.llm.openai.baseUrl,
            finalProxyUrl: `${config.llm.openai.baseUrl}/v1${remainingPath}`,
          },
          "OpenAI Responses proxy preHandler: URL rewritten (UUID stripped)",
        );
      } else {
        logger.info(
          {
            method: request.method,
            url: request.url,
            upstream: config.llm.openai.baseUrl,
            finalProxyUrl: `${config.llm.openai.baseUrl}/v1${pathAfterPrefix}`,
          },
          "OpenAI Responses proxy preHandler: proxying request",
        );
      }

      next();
    },
  });

  fastify.post(
    `${API_PREFIX}${RESPONSES_SUFFIX}`,
    {
      bodyLimit: PROXY_BODY_LIMIT,
      schema: {
        operationId: RouteId.OpenAiResponsesWithDefaultAgent,
        description:
          "Send a responses request to OpenAI using the default agent",
        tags: ["llm-proxy"],
        body: OpenAiResponses.API.ResponsesRequestSchema,
        headers: OpenAiResponses.API.ResponsesHeadersSchema,
        response: constructResponseSchema(
          OpenAiResponses.API.ResponsesResponseSchema,
        ),
      },
    },
    async (request, reply) => {
      logger.debug(
        { url: request.url },
        "[UnifiedProxy] Handling OpenAI Responses request (default agent)",
      );
      const externalAgentId = utils.externalAgentId.getExternalAgentId(
        request.headers,
      );
      const userId = await utils.userId.getUserId(request.headers);
      return handleLLMProxy(
        request.body,
        request.headers,
        reply,
        openaiResponsesAdapterFactory,
        {
          organizationId: request.organizationId,
          agentId: undefined,
          externalAgentId,
          userId,
        },
      );
    },
  );

  fastify.post(
    `${API_PREFIX}/:agentId${RESPONSES_SUFFIX}`,
    {
      bodyLimit: PROXY_BODY_LIMIT,
      schema: {
        operationId: RouteId.OpenAiResponsesWithAgent,
        description:
          "Send a responses request to OpenAI using a specific agent",
        tags: ["llm-proxy"],
        params: z.object({
          agentId: UuidIdSchema,
        }),
        body: OpenAiResponses.API.ResponsesRequestSchema,
        headers: OpenAiResponses.API.ResponsesHeadersSchema,
        response: constructResponseSchema(
          OpenAiResponses.API.ResponsesResponseSchema,
        ),
      },
    },
    async (request, reply) => {
      logger.debug(
        { url: request.url, agentId: request.params.agentId },
        "[UnifiedProxy] Handling OpenAI Responses request (with agent)",
      );
      const externalAgentId = utils.externalAgentId.getExternalAgentId(
        request.headers,
      );
      const userId = await utils.userId.getUserId(request.headers);
      return handleLLMProxy(
        request.body,
        request.headers,
        reply,
        openaiResponsesAdapterFactory,
        {
          organizationId: request.organizationId,
          agentId: request.params.agentId,
          externalAgentId,
          userId,
        },
      );
    },
  );
};

export default openAiResponsesProxyRoutesV2;
