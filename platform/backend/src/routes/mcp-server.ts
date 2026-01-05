import { RouteId } from "@shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { hasPermission } from "@/auth";
import logger from "@/logging";
import { McpServerRuntimeManager } from "@/mcp-server-runtime";
import {
  AgentToolModel,
  InternalMcpCatalogModel,
  McpServerModel,
  ToolModel,
} from "@/models";
import { isByosEnabled, secretManager } from "@/secrets-manager";
import {
  ApiError,
  constructResponseSchema,
  DeleteObjectResponseSchema,
  InsertMcpServerSchema,
  type InternalMcpCatalogServerType,
  LocalMcpServerInstallationStatusSchema,
  type McpServer,
  SelectMcpServerSchema,
  UuidIdSchema,
} from "@/types";

/**
 * Shared async function for local MCP server installation.
 * Waits for deployment, discovers tools, persists them, and assigns to profiles.
 * Used by both install and reinstall to ensure identical behavior.
 */
async function installLocalMcpServer(params: {
  mcpServer: McpServer;
  catalogId: string;
  catalogName: string;
  /** Profile IDs to assign tools to. If not provided, auto-assigns to profiles that already have this catalog's tools. */
  agentIds?: string[];
}): Promise<void> {
  const { mcpServer, catalogId, catalogName, agentIds } = params;

  const k8sDeployment = McpServerRuntimeManager.getDeployment(mcpServer.id);
  if (!k8sDeployment) {
    throw new Error("Deployment manager not found");
  }

  logger.info(`Waiting for deployment to be ready: ${mcpServer.name}`);
  await k8sDeployment.waitForDeploymentReady(60, 2000);

  logger.info(
    `Deployment is ready, updating status to discovering-tools: ${mcpServer.name}`,
  );
  await McpServerModel.update(mcpServer.id, {
    localInstallationStatus: "discovering-tools",
    localInstallationError: null,
  });

  logger.info(`Attempting to fetch tools from local server: ${mcpServer.name}`);
  const tools = await McpServerModel.getToolsFromServer(mcpServer);
  logger.info(`Discovered ${tools.length} tools from ${mcpServer.name}`);

  const toolsToCreate = tools.map((tool) => ({
    name: ToolModel.slugifyName(catalogName, tool.name),
    description: tool.description,
    parameters: tool.inputSchema,
    catalogId,
    mcpServerId: mcpServer.id,
  }));

  const createdTools = await ToolModel.bulkCreateToolsIfNotExists(toolsToCreate);
  const toolIds = createdTools.map((t) => t.id);

  // Assign tools to profiles
  if (agentIds && agentIds.length > 0) {
    // Explicit profile IDs provided (fresh install with agentIds)
    await AgentToolModel.bulkCreateForAgentsAndTools(agentIds, toolIds, {
      executionSourceMcpServerId: mcpServer.id,
    });
    logger.info(`Assigned ${toolIds.length} tools to ${agentIds.length} profiles`);
  } else {
    // Auto-assign to profiles that already have this catalog's tools (reinstall case)
    const profilesWithTools =
      await ToolModel.getProfilesWithCatalogTools(catalogId);
    if (profilesWithTools.length > 0 && toolIds.length > 0) {
      await AgentToolModel.bulkCreateForAgentsAndTools(
        profilesWithTools,
        toolIds,
        { executionSourceMcpServerId: mcpServer.id },
      );
      logger.info(
        `Auto-assigned ${toolIds.length} tools to ${profilesWithTools.length} profiles`,
      );
    }
  }

  await McpServerModel.update(mcpServer.id, {
    localInstallationStatus: "success",
    localInstallationError: null,
  });

  logger.info(
    `Successfully installed ${tools.length} tools from local server: ${mcpServer.name}`,
  );
}

const mcpServerRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/api/mcp_server",
    {
      schema: {
        operationId: RouteId.GetMcpServers,
        description: "Get all installed MCP servers",
        tags: ["MCP Server"],
        querystring: z.object({
          catalogId: z.string().optional(),
        }),
        response: constructResponseSchema(z.array(SelectMcpServerSchema)),
      },
    },
    async ({ user, headers, query }, reply) => {
      const { catalogId } = query;
      const { success: isMcpServerAdmin } = await hasPermission(
        { mcpServer: ["admin"] },
        headers,
      );
      let allServers = await McpServerModel.findAll(user.id, isMcpServerAdmin);

      // Filter by catalogId if provided
      if (catalogId) {
        allServers = allServers.filter((s) => s.catalogId === catalogId);
      }

      return reply.send(allServers);
    },
  );

  fastify.get(
    "/api/mcp_server/:id",
    {
      schema: {
        operationId: RouteId.GetMcpServer,
        description: "Get MCP server by ID",
        tags: ["MCP Server"],
        params: z.object({
          id: UuidIdSchema,
        }),
        response: constructResponseSchema(SelectMcpServerSchema),
      },
    },
    async ({ params: { id }, user }, reply) => {
      const server = await McpServerModel.findById(id, user.id);

      if (!server) {
        throw new ApiError(404, "MCP server not found");
      }

      return reply.send(server);
    },
  );

  fastify.post(
    "/api/mcp_server",
    {
      schema: {
        operationId: RouteId.InstallMcpServer,
        description: "Install an MCP server (from catalog or custom)",
        tags: ["MCP Server"],
        body: InsertMcpServerSchema.omit({ serverType: true }).extend({
          agentIds: z.array(UuidIdSchema).optional(),
          secretId: UuidIdSchema.optional(),
          // For PAT tokens (like GitHub), send the token directly
          // and we'll create a secret for it
          accessToken: z.string().optional(),
          // When true, environmentValues and userConfigValues contain vault references in "path#key" format
          isByosVault: z.boolean().optional(),
        }),
        response: constructResponseSchema(SelectMcpServerSchema),
      },
    },
    async ({ body, user }, reply) => {
      let {
        agentIds,
        secretId,
        accessToken,
        isByosVault,
        userConfigValues,
        environmentValues,
        ...restDataFromRequestBody
      } = body;
      const serverData: typeof restDataFromRequestBody & {
        serverType: InternalMcpCatalogServerType;
      } = {
        ...restDataFromRequestBody,
        serverType: "local",
      };

      // Set owner_id and userId to current user
      serverData.ownerId = user.id;
      serverData.userId = user.id;

      // Track if we created a new secret (for cleanup on failure)
      let createdSecretId: string | undefined;

      // Fetch catalog item FIRST to determine server type
      let catalogItem = null;
      if (serverData.catalogId) {
        catalogItem = await InternalMcpCatalogModel.findById(
          serverData.catalogId,
        );

        if (!catalogItem) {
          throw new ApiError(400, "Catalog item not found");
        }

        // Set serverType from catalog item
        serverData.serverType = catalogItem.serverType;

        // Reject personal installations when Readonly Vault is enabled
        if (isByosEnabled() && !serverData.teamId) {
          throw new ApiError(
            400,
            "Personal MCP server installations are not allowed when Readonly Vault is enabled. Please select a team.",
          );
        }

        // Validate no duplicate installations for this catalog item
        const existingServers = await McpServerModel.findByCatalogId(
          serverData.catalogId,
        );

        // Check for duplicate personal installation (same user, no team)
        if (!serverData.teamId) {
          const existingPersonal = existingServers.find(
            (s) => s.ownerId === user.id && !s.teamId,
          );
          if (existingPersonal) {
            throw new ApiError(
              400,
              "You already have a personal installation of this MCP server",
            );
          }
        }

        // Check for duplicate team installation (same team)
        if (serverData.teamId) {
          const existingTeam = existingServers.find(
            (s) => s.teamId === serverData.teamId,
          );
          if (existingTeam) {
            throw new ApiError(
              400,
              "This team already has an installation of this MCP server",
            );
          }
        }
      }

      // For REMOTE servers: create secrets and validate connection
      if (catalogItem?.serverType === "remote") {
        // If isByosVault flag is set, use vault references from userConfigValues
        if (isByosVault && userConfigValues && !secretId) {
          if (!isByosEnabled()) {
            throw new ApiError(
              400,
              "Readonly Vault is not enabled. " +
                "Requires ARCHESTRA_SECRETS_MANAGER=READONLY_VAULT and an enterprise license.",
            );
          }

          // userConfigValues already contains vault references in "path#key" format
          const secret = await secretManager().createSecret(
            userConfigValues as Record<string, unknown>,
            `${serverData.name}-vault-secret`,
          );
          secretId = secret.id;
          createdSecretId = secret.id;
          logger.info(
            { keyCount: Object.keys(userConfigValues).length },
            "Created Readonly Vault secret with per-field references for remote server",
          );
        }

        // If accessToken is provided (PAT flow), create a secret for it
        // Not allowed when Readonly Vault is enabled - use vault secrets instead
        if (accessToken && !secretId) {
          if (isByosEnabled()) {
            throw new ApiError(
              400,
              "Manual PAT token input is not allowed when Readonly Vault is enabled. Please use Vault secrets instead.",
            );
          }
          const secret = await secretManager().createSecret(
            { access_token: accessToken },
            `${serverData.name}-token`,
          );
          secretId = secret.id;
          createdSecretId = secret.id;
        }

        // Validate connection for remote servers
        if (secretId) {
          const isValid = await McpServerModel.validateConnection(
            serverData.name,
            serverData.catalogId ?? undefined,
            secretId,
          );

          if (!isValid) {
            // Clean up the secret we just created if validation fails
            if (createdSecretId) {
              secretManager().deleteSecret(createdSecretId);
            }

            throw new ApiError(
              400,
              "Failed to connect to MCP server with provided credentials",
            );
          }
        }
      }

      // For LOCAL servers: validate env vars and create secrets (no connection validation, since deployment will be started later)
      if (catalogItem?.serverType === "local") {
        // Validate required environment variables
        if (catalogItem.localConfig?.environment) {
          const requiredEnvVars = catalogItem.localConfig.environment.filter(
            (env) => env.promptOnInstallation && env.required,
          );

          const missingEnvVars = requiredEnvVars.filter((env) => {
            const value = environmentValues?.[env.key];
            // For boolean type, check if value exists
            if (env.type === "boolean") {
              return !value;
            }
            // For other types, check if trimmed value is non-empty
            return !value?.trim();
          });

          if (missingEnvVars.length > 0) {
            throw new ApiError(
              400,
              `Missing required environment variables: ${missingEnvVars
                .map((env) => env.key)
                .join(", ")}`,
            );
          }
        }

        // If isByosVault flag is set, use vault references from environmentValues for secret env vars
        if (isByosVault && !secretId && catalogItem.localConfig?.environment) {
          if (!isByosEnabled()) {
            throw new ApiError(
              400,
              "Readonly Vault is not enabled. " +
                "Requires ARCHESTRA_SECRETS_MANAGER=READONLY_VAULT and an enterprise license.",
            );
          }

          // Collect secret env vars with vault references from environmentValues
          const secretEnvVars: Record<string, string> = {};
          for (const envDef of catalogItem.localConfig.environment) {
            if (envDef.type === "secret") {
              const value = envDef.promptOnInstallation
                ? environmentValues?.[envDef.key]
                : envDef.value;
              if (value) {
                // Value should already be in "path#key" format from frontend
                secretEnvVars[envDef.key] = value;
              }
            }
          }

          if (Object.keys(secretEnvVars).length > 0) {
            const secret = await secretManager().createSecret(
              secretEnvVars,
              `${serverData.name}-vault-secret`,
            );
            secretId = secret.id;
            createdSecretId = secret.id;
            logger.info(
              { keyCount: Object.keys(secretEnvVars).length },
              "Created Readonly Vault secret with per-field references for local server",
            );
          }
        }
        // Collect and store secret-type env vars
        // When Readonly Vault is enabled, only static (non-prompted) secrets are allowed to be stored in DB
        // User-prompted secrets must use Vault references via the isByosVault flow above
        else if (!secretId && catalogItem.localConfig?.environment) {
          const secretEnvVars: Record<string, string> = {};
          let hasPromptedSecrets = false;

          // Collect all secret-type env vars (both static and prompted)
          for (const envDef of catalogItem.localConfig.environment) {
            if (envDef.type === "secret") {
              let value: string | undefined;
              // Get value based on whether it's prompted or static
              if (envDef.promptOnInstallation) {
                // Prompted during installation - get from environmentValues
                value = environmentValues?.[envDef.key];
                if (value) {
                  hasPromptedSecrets = true;
                }
              } else {
                // Static value from catalog - get from envDef.value
                value = envDef.value;
              }
              // Add to secret if value exists
              if (value) {
                secretEnvVars[envDef.key] = value;
              }
            }
          }

          // Block user-prompted secrets when Readonly Vault is enabled (they should use Vault)
          // Static secrets from catalog are allowed since they're not manual user input
          if (hasPromptedSecrets && isByosEnabled()) {
            throw new ApiError(
              400,
              "Manual secret input is not allowed when Readonly Vault is enabled. Please use Vault secrets instead.",
            );
          }

          // Create secret in database if there are any secret env vars
          if (Object.keys(secretEnvVars).length > 0) {
            const secret = await secretManager().createSecret(
              secretEnvVars,
              `mcp-server-${serverData.name}-env`,
            );
            secretId = secret.id;
            createdSecretId = secret.id;
            logger.info(
              {
                secretId: secret.id,
                envVarCount: Object.keys(secretEnvVars).length,
              },
              "Created secret for local MCP server environment variables",
            );
          }
        }
      }

      // Create the MCP server with optional secret reference
      const mcpServer = await McpServerModel.create({
        ...serverData,
        ...(secretId && { secretId }),
      });

      try {
        // For local servers, start the K8s deployment first
        if (catalogItem?.serverType === "local") {
          try {
            // Capture catalogId before async callback to ensure it's available
            const capturedCatalogId = catalogItem.id;
            const capturedCatalogName = catalogItem.name;

            // Set status to pending before starting the deployment
            await McpServerModel.update(mcpServer.id, {
              localInstallationStatus: "pending",
              localInstallationError: null,
            });

            await McpServerRuntimeManager.startServer(
              mcpServer,
              userConfigValues,
              environmentValues,
            );
            fastify.log.info(
              `Started K8s deployment for local MCP server: ${mcpServer.name}`,
            );

            // For local servers, return immediately without waiting for tools
            // Tools will be fetched asynchronously after the deployment is ready
            fastify.log.info(
              `Skipping synchronous tool fetch for local server: ${mcpServer.name}. Tools will be fetched asynchronously.`,
            );

            // Start async tool fetching in the background (non-blocking)
            installLocalMcpServer({
              mcpServer,
              catalogId: capturedCatalogId,
              catalogName: capturedCatalogName,
              agentIds,
            }).catch(async (error) => {
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              fastify.log.error(
                `Failed to install local server ${mcpServer.name}: ${errorMessage}`,
              );
              await McpServerModel.update(mcpServer.id, {
                localInstallationStatus: "error",
                localInstallationError: errorMessage,
              });
            });

            // Return the MCP server with pending status
            return reply.send({
              ...mcpServer,
              localInstallationStatus: "pending",
              localInstallationError: null,
            });
          } catch (podError) {
            // If deployment fails to start, set status to error
            const errorMessage =
              podError instanceof Error ? podError.message : "Unknown error";
            fastify.log.error(
              `Failed to start K8s deployment for MCP server ${mcpServer.name}: ${errorMessage}`,
            );

            await McpServerModel.update(mcpServer.id, {
              localInstallationStatus: "error",
              localInstallationError: `Failed to start deployment: ${errorMessage}`,
            });

            // Return the server with error status instead of throwing 500
            return reply.send({
              ...mcpServer,
              localInstallationStatus: "error",
              localInstallationError: `Failed to start deployment: ${errorMessage}`,
            });
          }
        }

        // For non-local servers, fetch tools synchronously during installation
        const tools = await McpServerModel.getToolsFromServer(mcpServer);

        // Catalog item must exist for remote servers
        if (!catalogItem) {
          throw new ApiError(400, "Catalog item not found for remote server");
        }

        // Persist tools in the database with source='mcp_server' and mcpServerId
        // Note: For remote servers, mcpServer.name doesn't include userId, so we can use it directly
        const toolsToCreate = tools.map((tool) => ({
          name: ToolModel.slugifyName(mcpServer.name, tool.name),
          description: tool.description,
          parameters: tool.inputSchema,
          catalogId: catalogItem.id,
          mcpServerId: mcpServer.id,
        }));

        // Bulk create tools to avoid N+1 queries
        const createdTools =
          await ToolModel.bulkCreateToolsIfNotExists(toolsToCreate);

        // If agentIds were provided, create agent-tool assignments
        // Note: Remote servers don't use executionSourceMcpServerId (they route via HTTP)
        if (agentIds && agentIds.length > 0) {
          const toolIds = createdTools.map((t) => t.id);
          await AgentToolModel.bulkCreateForAgentsAndTools(agentIds, toolIds);
        }

        // Set status to success for non-local servers
        await McpServerModel.update(mcpServer.id, {
          localInstallationStatus: "success",
          localInstallationError: null,
        });

        return reply.send({
          ...mcpServer,
          localInstallationStatus: "success",
          localInstallationError: null,
        });
      } catch (toolError) {
        // If fetching/creating tools fails, clean up everything we created
        await McpServerModel.delete(mcpServer.id);

        // Also clean up the secret if we created one
        if (createdSecretId) {
          await secretManager().deleteSecret(createdSecretId);
        }

        throw new ApiError(
          500,
          `Failed to fetch tools from MCP server ${mcpServer.name}: ${toolError instanceof Error ? toolError.message : "Unknown error"}`,
        );
      }
    },
  );

  fastify.delete(
    "/api/mcp_server/:id",
    {
      schema: {
        operationId: RouteId.DeleteMcpServer,
        description: "Delete/uninstall an MCP server",
        tags: ["MCP Server"],
        params: z.object({
          id: UuidIdSchema,
        }),
        response: constructResponseSchema(DeleteObjectResponseSchema),
      },
    },
    async ({ params: { id: mcpServerId } }, reply) => {
      // Fetch the MCP server first to get secretId and serverType
      const mcpServer = await McpServerModel.findById(mcpServerId);

      if (!mcpServer) {
        throw new ApiError(404, "MCP server not found");
      }

      // For local servers, stop the server (this will delete the K8s Secret)
      if (mcpServer.serverType === "local") {
        try {
          await McpServerRuntimeManager.stopServer(mcpServerId);
          logger.info(
            { mcpServerId },
            "Stopped K8s deployment and deleted K8s Secret for local MCP server",
          );
        } catch (error) {
          logger.error(
            { err: error, mcpServerId },
            "Failed to stop local MCP server deployment",
          );
          // Continue with deletion even if pod stop fails
        }
      }

      // Delete database secret if it exists and is for a local server
      // (don't delete OAuth tokens for remote servers)
      if (mcpServer.secretId && mcpServer.serverType === "local") {
        try {
          await secretManager().deleteSecret(mcpServer.secretId);
          logger.info(
            { mcpServerId },
            "Deleted database secret for local MCP server",
          );
        } catch (error) {
          logger.error(
            { err: error, mcpServerId },
            "Failed to delete database secret",
          );
          // Continue with MCP server deletion even if secret deletion fails
        }
      }

      // Delete the MCP server record
      const success = await McpServerModel.delete(mcpServerId);

      return reply.send({ success });
    },
  );

  fastify.get(
    "/api/mcp_server/:id/installation-status",
    {
      schema: {
        operationId: RouteId.GetMcpServerInstallationStatus,
        description:
          "Get the installation status of an MCP server (for polling during local server installation)",
        tags: ["MCP Server"],
        params: z.object({
          id: UuidIdSchema,
        }),
        response: constructResponseSchema(
          z.object({
            localInstallationStatus: LocalMcpServerInstallationStatusSchema,
            localInstallationError: z.string().nullable(),
          }),
        ),
      },
    },
    async ({ params: { id } }, reply) => {
      const mcpServer = await McpServerModel.findById(id);

      if (!mcpServer) {
        throw new ApiError(404, "MCP server not found");
      }

      return reply.send({
        localInstallationStatus: mcpServer.localInstallationStatus || "idle",
        localInstallationError: mcpServer.localInstallationError || null,
      });
    },
  );

  fastify.get(
    "/api/mcp_server/:id/tools",
    {
      schema: {
        operationId: RouteId.GetMcpServerTools,
        description: "Get all tools for an MCP server",
        tags: ["MCP Server"],
        params: z.object({
          id: UuidIdSchema,
        }),
        response: constructResponseSchema(
          z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              description: z.string().nullable(),
              parameters: z.record(z.string(), z.any()),
              createdAt: z.coerce.date(),
              assignedAgentCount: z.number(),
              assignedAgents: z.array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                }),
              ),
            }),
          ),
        ),
      },
    },
    async ({ params: { id } }, reply) => {
      // Get the MCP server first to check if it has a catalogId
      const mcpServer = await McpServerModel.findById(id);

      if (!mcpServer) {
        throw new ApiError(404, "MCP server not found");
      }

      // For catalog-based servers (local installations), query tools by catalogId
      // This ensures all installations of the same catalog show the same tools
      // For legacy servers without catalogId, fall back to mcpServerId
      const tools = mcpServer.catalogId
        ? await ToolModel.findByCatalogId(mcpServer.catalogId)
        : await ToolModel.findByMcpServerId(id);

      return reply.send(tools);
    },
  );

  fastify.get(
    "/api/mcp_server/:id/logs",
    {
      schema: {
        operationId: RouteId.GetMcpServerLogs,
        description: "Get logs for a specific MCP server deployment",
        tags: ["MCP Server"],
        params: z.object({
          id: UuidIdSchema,
        }),
        querystring: z.object({
          lines: z.coerce.number().optional().default(100),
          follow: z.coerce.boolean().optional().default(false),
        }),
        response: constructResponseSchema(
          z.object({
            logs: z.string(),
            containerName: z.string(),
            command: z.string(),
            namespace: z.string(),
          }),
        ),
      },
    },
    async ({ params: { id }, query: { lines, follow } }, reply) => {
      try {
        // If follow is enabled, stream the logs
        if (follow) {
          // Hijack the response to handle streaming
          reply.hijack();
          reply.raw.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
            "Transfer-Encoding": "chunked",
          });

          await McpServerRuntimeManager.streamMcpServerLogs(
            id,
            reply.raw,
            lines,
          );

          return;
        }

        // Otherwise, return logs as usual
        const logs = await McpServerRuntimeManager.getMcpServerLogs(id, lines);
        return reply.send(logs);
      } catch (error) {
        fastify.log.error(
          `Error getting logs for MCP server ${id}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );

        // If we've already hijacked, we can't send a normal error response
        if (follow && reply.raw.headersSent) {
          reply.raw.end();
          return;
        }

        throw new ApiError(
          404,
          `Failed to get logs for MCP server ${id}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
  );

  fastify.post(
    "/api/mcp_server/:id/restart",
    {
      schema: {
        operationId: RouteId.RestartMcpServer,
        description: "Restart a single MCP server deployment",
        tags: ["MCP Server"],
        params: z.object({
          id: UuidIdSchema,
        }),
        response: constructResponseSchema(
          z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        ),
      },
    },
    async ({ params: { id } }, reply) => {
      try {
        await McpServerRuntimeManager.restartServer(id);
        return reply.send({
          success: true,
          message: `MCP server ${id} restarted successfully`,
        });
      } catch (error) {
        fastify.log.error(
          `Failed to restart MCP server ${id}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );

        if (error instanceof Error && error.message?.includes("not found")) {
          throw new ApiError(404, error.message);
        }

        throw new ApiError(
          500,
          `Failed to restart MCP server: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
  );

  /**
   * Atomic reinstall: Stops deployment, starts with updated catalog config, refreshes tools.
   * Unlike uninstall+install, this preserves the mcp_server record and all agent_tools assignments.
   */
  fastify.post(
    "/api/mcp_server/:id/reinstall",
    {
      schema: {
        operationId: RouteId.ReinstallMcpServer,
        description:
          "Reinstall an MCP server with updated catalog config (atomic operation)",
        tags: ["MCP Server"],
        params: z.object({
          id: UuidIdSchema,
        }),
        response: constructResponseSchema(SelectMcpServerSchema),
      },
    },
    async ({ params: { id } }, reply) => {
      // Get the existing MCP server
      const mcpServer = await McpServerModel.findById(id);
      if (!mcpServer) {
        throw new ApiError(404, "MCP server not found");
      }

      // Get the catalog item for config
      if (!mcpServer.catalogId) {
        throw new ApiError(400, "Cannot reinstall server without catalog");
      }

      const catalogItem = await InternalMcpCatalogModel.findById(
        mcpServer.catalogId,
      );
      if (!catalogItem) {
        throw new ApiError(404, "Catalog item not found");
      }

      try {
        // For local servers: stop, start with fresh config, refresh tools
        if (catalogItem.serverType === "local") {
          // Update status to pending
          await McpServerModel.update(mcpServer.id, {
            localInstallationStatus: "pending",
            localInstallationError: null,
            reinstallRequired: false,
          });

          // Stop the deployment
          try {
            await McpServerRuntimeManager.removeMcpServer(mcpServer.id);
          } catch (stopError) {
            // Ignore if deployment doesn't exist (might have been cleaned up)
            fastify.log.warn(
              `Could not stop deployment during reinstall: ${stopError instanceof Error ? stopError.message : "Unknown error"}`,
            );
          }

          // Wait for cleanup
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Build userConfigValues from catalog defaults
          // This ensures ${user_config.xxx} placeholders are interpolated correctly
          let userConfigValues: Record<string, string> | undefined;
          if (catalogItem.userConfig) {
            userConfigValues = {};
            for (const [key, field] of Object.entries(catalogItem.userConfig)) {
              if (field.default !== undefined) {
                userConfigValues[key] = String(field.default);
              }
            }
            fastify.log.info(
              { userConfigValues },
              "Reinstall: built userConfigValues from catalog defaults",
            );
          }

          // Load secret env values (for secrets like K8S_TOKEN)
          let environmentValues: Record<string, string> | undefined;
          if (mcpServer.secretId) {
            const secret = await secretManager().getSecret(mcpServer.secretId);
            if (secret?.secret && typeof secret.secret === "object") {
              environmentValues = {};
              for (const [key, value] of Object.entries(secret.secret)) {
                environmentValues[key] = String(value);
              }
              fastify.log.info(
                { keys: Object.keys(environmentValues) },
                "Reinstall: loaded secret env values",
              );
            }
          }

          // Start with fresh config using catalog defaults
          await McpServerRuntimeManager.startServer(
            mcpServer,
            userConfigValues,
            environmentValues,
          );

          // Return immediately, tool refresh happens async (same as install)
          installLocalMcpServer({
            mcpServer,
            catalogId: catalogItem.id,
            catalogName: catalogItem.name,
            // No agentIds = auto-assign to profiles that already have this catalog's tools
          }).catch(async (error) => {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            fastify.log.error(
              `Reinstall failed for ${mcpServer.name}: ${errorMessage}`,
            );
            await McpServerModel.update(mcpServer.id, {
              localInstallationStatus: "error",
              localInstallationError: errorMessage,
            });
          });

          return reply.send({
            ...mcpServer,
            localInstallationStatus: "pending",
            reinstallRequired: false,
          });
        }

        // For remote servers: just refresh tools
        await McpServerModel.update(mcpServer.id, {
          reinstallRequired: false,
        });

        const tools = await McpServerModel.getToolsFromServer(mcpServer);
        const toolsToCreate = tools.map((tool) => ({
          name: ToolModel.slugifyName(catalogItem.name, tool.name),
          description: tool.description,
          parameters: tool.inputSchema,
          catalogId: catalogItem.id,
          mcpServerId: mcpServer.id,
        }));

        const refreshedTools =
          await ToolModel.bulkCreateToolsIfNotExists(toolsToCreate);

        // Auto-assign new tools to profiles that already have this catalog's tools
        const allToolIds = refreshedTools.map((t) => t.id);
        const profilesWithTools =
          await ToolModel.getProfilesWithCatalogTools(catalogItem.id);

        if (profilesWithTools.length > 0 && allToolIds.length > 0) {
          await AgentToolModel.bulkCreateForAgentsAndTools(
            profilesWithTools,
            allToolIds,
            { executionSourceMcpServerId: mcpServer.id },
          );
          fastify.log.info(
            `Auto-assigned ${allToolIds.length} tools to ${profilesWithTools.length} profiles`,
          );
        }

        fastify.log.info(
          `Reinstall complete for remote server ${mcpServer.name}: ${tools.length} tools refreshed`,
        );

        return reply.send({
          ...mcpServer,
          reinstallRequired: false,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error(
          `Reinstall failed for ${mcpServer.name}: ${errorMessage}`,
        );

        await McpServerModel.update(mcpServer.id, {
          localInstallationStatus: "error",
          localInstallationError: `Reinstall failed: ${errorMessage}`,
        });

        throw new ApiError(500, `Reinstall failed: ${errorMessage}`);
      }
    },
  );

  fastify.post(
    "/api/mcp_catalog/:catalogId/restart-all-installations",
    {
      schema: {
        operationId: RouteId.RestartAllMcpServerInstallations,
        description:
          "Restart all MCP server installations for a given catalog item",
        tags: ["MCP Server"],
        params: z.object({
          catalogId: UuidIdSchema,
        }),
        response: constructResponseSchema(
          z.object({
            success: z.boolean(),
            message: z.string(),
            results: z.array(
              z.object({
                serverId: z.string(),
                serverName: z.string(),
                success: z.boolean(),
                error: z.string().optional(),
              }),
            ),
            summary: z.object({
              total: z.number(),
              succeeded: z.number(),
              failed: z.number(),
            }),
          }),
        ),
      },
    },
    async ({ params: { catalogId } }, reply) => {
      // Verify the catalog item exists
      const catalogItem = await InternalMcpCatalogModel.findById(catalogId);
      if (!catalogItem) {
        throw new ApiError(404, `Catalog item ${catalogId} not found`);
      }

      // Find all MCP server installations for this catalog item
      const servers = await McpServerModel.findByCatalogId(catalogId);

      if (servers.length === 0) {
        return reply.send({
          success: true,
          message: "No installations found for this catalog item",
          results: [],
          summary: { total: 0, succeeded: 0, failed: 0 },
        });
      }

      // Restart each server sequentially
      const results: Array<{
        serverId: string;
        serverName: string;
        success: boolean;
        error?: string;
      }> = [];

      for (const server of servers) {
        try {
          await McpServerRuntimeManager.restartServer(server.id);
          results.push({
            serverId: server.id,
            serverName: server.name,
            success: true,
          });
          logger.info(
            `Restarted MCP server ${server.id} (${server.name}) as part of restart-all for catalog ${catalogId}`,
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          results.push({
            serverId: server.id,
            serverName: server.name,
            success: false,
            error: errorMessage,
          });
          logger.error(
            `Failed to restart MCP server ${server.id} (${server.name}): ${errorMessage}`,
          );
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return reply.send({
        success: failed === 0,
        message:
          failed === 0
            ? `Successfully restarted all ${succeeded} installation(s)`
            : `Restarted ${succeeded} of ${servers.length} installation(s), ${failed} failed`,
        results,
        summary: {
          total: servers.length,
          succeeded,
          failed,
        },
      });
    },
  );
};

export default mcpServerRoutes;
