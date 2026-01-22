"use client";

import {
  ARCHESTRA_MCP_SERVER_NAME,
  MCP_SERVER_TOOL_NAME_SEPARATOR,
} from "@shared";
import { Bot, Loader2, Plus, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useInternalAgents } from "@/lib/agent.query";
import {
  useAgentDelegationTools,
  useConversationEnabledTools,
  useProfileToolsWithIds,
  useUpdateConversationEnabledTools,
} from "@/lib/chat.query";
import {
  addPendingAction,
  applyPendingActions,
  getPendingActions,
  type PendingToolAction,
} from "@/lib/pending-tool-state";
import { cn } from "@/lib/utils";

interface ProfileToolsDisplayProps {
  agentId: string;
  promptId?: string | null;
  /** Required for enable/disable functionality. Optional for read-only display. */
  conversationId?: string;
  className?: string;
  /** When true, hides enable/disable buttons and shows all tools as enabled */
  readOnly?: boolean;
  /** Optional button to add more agents (shown in chat header) */
  addAgentsButton?: ReactNode;
}

type ToolItem = {
  id: string;
  name: string;
  description: string | null;
};

/**
 * Unified display for both MCP tools and delegated agents.
 * Use this component anywhere you need to show profile tools and agent delegations.
 *
 * - In chat prompt input: shows tools grouped by server with enable/disable
 * - In chat header: shows delegated agents with enable/disable + add button
 * - In dialog: read-only mode shows all assigned tools and agents
 *
 * When no conversation exists, pending actions are stored in localStorage
 * and applied when the conversation is created via first message.
 */
export function ProfileToolsDisplay({
  agentId,
  promptId,
  conversationId,
  className,
  readOnly = false,
  addAgentsButton,
}: ProfileToolsDisplayProps) {
  // Fetch MCP tools
  const { data: profileTools = [], isLoading: isLoadingTools } =
    useProfileToolsWithIds(agentId);

  // Fetch delegation tools
  const { data: delegationTools = [], isLoading: isLoadingDelegations } =
    useAgentDelegationTools(agentId);

  const { data: allAgents = [] } = useInternalAgents();

  // State for tooltip open state per server
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);
  const tooltipContentRef = useRef<HTMLDivElement | null>(null);

  // Local pending actions for display (synced with localStorage)
  const [localPendingActions, setLocalPendingActions] = useState<
    PendingToolAction[]
  >([]);

  // Load pending actions from localStorage on mount and when context changes
  useEffect(() => {
    if (!conversationId) {
      const actions = getPendingActions(agentId, promptId ?? null);
      setLocalPendingActions(actions);
    } else {
      setLocalPendingActions([]);
    }
  }, [agentId, promptId, conversationId]);

  // Handle click outside to close tooltips
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (tooltipContentRef.current?.contains(target)) {
        return;
      }

      const clickedButton = (target as HTMLElement).closest(
        "[data-tool-button]",
      );
      if (clickedButton) {
        return;
      }

      setOpenTooltip(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch enabled tools for the conversation
  const { data: enabledToolsData } = useConversationEnabledTools(
    readOnly || !conversationId ? undefined : conversationId,
  );
  const enabledToolIds = enabledToolsData?.enabledToolIds ?? [];
  const hasCustomSelection = enabledToolsData?.hasCustomSelection ?? false;

  // Mutation for updating enabled tools
  const updateEnabledTools = useUpdateConversationEnabledTools();

  // Map delegationTools to their display names
  const agentToolsWithNames = useMemo(() => {
    return delegationTools.map((tool) => {
      const agentName = tool.name.replace(/^delegate_to_/, "");
      const matchingAgent = allAgents.find(
        (a) => a.name.toLowerCase().replace(/\s+/g, "_") === agentName,
      );
      return {
        ...tool,
        displayName: matchingAgent?.name ?? agentName.replace(/_/g, " "),
      };
    });
  }, [delegationTools, allAgents]);

  // Default enabled tools logic:
  // - Disable all Archestra tools (archestra__*) by default
  // - Except archestra__todo_write and archestra__artifact_write which stay enabled
  // - All other tools (non-Archestra, agent delegation) remain enabled
  const defaultEnabledToolIds = useMemo(
    () =>
      [...profileTools, ...delegationTools]
        .filter(
          (tool) =>
            !tool.name.startsWith("archestra__") ||
            tool.name === "archestra__todo_write" ||
            tool.name === "archestra__artifact_write",
        )
        .map((t) => t.id),
    [profileTools, delegationTools],
  );

  // Compute current enabled tools
  const currentEnabledToolIds = useMemo(() => {
    if (conversationId && hasCustomSelection) {
      return enabledToolIds;
    }

    const baseIds = defaultEnabledToolIds;

    if (!conversationId && localPendingActions.length > 0) {
      return applyPendingActions(baseIds, localPendingActions);
    }

    return baseIds;
  }, [
    conversationId,
    hasCustomSelection,
    enabledToolIds,
    defaultEnabledToolIds,
    localPendingActions,
  ]);

  const enabledToolIdsSet = new Set(currentEnabledToolIds);

  // Group MCP tools by server name
  const groupedTools: Record<string, ToolItem[]> = {};
  for (const tool of profileTools) {
    const parts = tool.name.split(MCP_SERVER_TOOL_NAME_SEPARATOR);
    const serverName =
      parts.length > 1
        ? parts.slice(0, -1).join(MCP_SERVER_TOOL_NAME_SEPARATOR)
        : "default";
    if (!groupedTools[serverName]) {
      groupedTools[serverName] = [];
    }
    groupedTools[serverName].push(tool);
  }

  // Sort server entries to always show Archestra first
  const sortedServerEntries = Object.entries(groupedTools).sort(([a], [b]) => {
    if (a === ARCHESTRA_MCP_SERVER_NAME) return -1;
    if (b === ARCHESTRA_MCP_SERVER_NAME) return 1;
    return a.localeCompare(b);
  });

  // Handle enabling a tool
  const handleEnableTool = (toolId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (!conversationId) {
      const action: PendingToolAction = { type: "enable", toolId };
      addPendingAction(action, agentId, promptId ?? null);
      setLocalPendingActions((prev) => [...prev, action]);
      return;
    }
    const newEnabledToolIds = [...currentEnabledToolIds, toolId];
    updateEnabledTools.mutateAsync({
      conversationId,
      toolIds: newEnabledToolIds,
    });
  };

  // Handle disabling a tool
  const handleDisableTool = (toolId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (!conversationId) {
      const action: PendingToolAction = { type: "disable", toolId };
      addPendingAction(action, agentId, promptId ?? null);
      setLocalPendingActions((prev) => [...prev, action]);
      return;
    }
    const newEnabledToolIds = currentEnabledToolIds.filter(
      (id) => id !== toolId,
    );
    updateEnabledTools.mutateAsync({
      conversationId,
      toolIds: newEnabledToolIds,
    });
  };

  // Handle disabling all enabled tools for a server
  const handleDisableAll = (toolIds: string[], event: React.MouseEvent) => {
    event.stopPropagation();
    if (!conversationId) {
      const action: PendingToolAction = { type: "disableAll", toolIds };
      addPendingAction(action, agentId, promptId ?? null);
      setLocalPendingActions((prev) => [...prev, action]);
      return;
    }
    const newEnabledToolIds = currentEnabledToolIds.filter(
      (id) => !toolIds.includes(id),
    );
    updateEnabledTools.mutateAsync({
      conversationId,
      toolIds: newEnabledToolIds,
    });
  };

  // Handle enabling all disabled tools for a server
  const handleEnableAll = (toolIds: string[], event: React.MouseEvent) => {
    event.stopPropagation();
    if (!conversationId) {
      const action: PendingToolAction = { type: "enableAll", toolIds };
      addPendingAction(action, agentId, promptId ?? null);
      setLocalPendingActions((prev) => [...prev, action]);
      return;
    }
    const newEnabledToolIds = [
      ...new Set([...currentEnabledToolIds, ...toolIds]),
    ];
    updateEnabledTools.mutateAsync({
      conversationId,
      toolIds: newEnabledToolIds,
    });
  };

  // Toggle agent tool
  const handleToggleAgentTool = (toolId: string) => {
    const isEnabled = enabledToolIdsSet.has(toolId);
    if (isEnabled) {
      handleDisableTool(toolId);
    } else {
      handleEnableTool(toolId);
    }
  };

  // Render a single tool row (for MCP tools popup)
  const renderToolRow = (tool: ToolItem, isDisabled: boolean) => {
    const parts = tool.name.split(MCP_SERVER_TOOL_NAME_SEPARATOR);
    const toolName = parts.length > 1 ? parts[parts.length - 1] : tool.name;
    const borderColor = isDisabled ? "border-red-500" : "border-green-500";

    return (
      <div key={tool.id} className={`border-l-2 ${borderColor} pl-2 ml-1 py-1`}>
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{toolName}</span>
          <div className="flex-1" />
          {!readOnly &&
            (isDisabled ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 rounded-full"
                onClick={(e) => handleEnableTool(tool.id, e)}
                title={`Enable ${toolName} for this chat`}
              >
                <Plus className="h-3 w-3" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:text-destructive"
                onClick={(e) => handleDisableTool(tool.id, e)}
                title={`Disable ${toolName} for this chat`}
              >
                <X className="h-3 w-3" />
              </Button>
            ))}
        </div>
      </div>
    );
  };

  const isLoading = isLoadingTools || isLoadingDelegations;

  if (isLoading) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Loading tools...</span>
        </div>
      </div>
    );
  }

  const hasTools = Object.keys(groupedTools).length > 0;
  const hasAgents = agentToolsWithNames.length > 0;

  if (!hasTools && !hasAgents && !addAgentsButton) {
    return null;
  }

  // Render MCP tool buttons (grouped by server)
  const toolButtons = sortedServerEntries.map(([serverName]) => {
    const allServerTools = profileTools.filter((tool) => {
      const parts = tool.name.split(MCP_SERVER_TOOL_NAME_SEPARATOR);
      const toolServerName =
        parts.length > 1
          ? parts.slice(0, -1).join(MCP_SERVER_TOOL_NAME_SEPARATOR)
          : "default";
      return toolServerName === serverName;
    });

    const enabledTools: ToolItem[] = [];
    const disabledTools: ToolItem[] = [];

    for (const tool of allServerTools) {
      if (enabledToolIdsSet.has(tool.id)) {
        enabledTools.push(tool);
      } else {
        disabledTools.push(tool);
      }
    }

    const totalToolsCount = allServerTools.length;
    const isOpen = openTooltip === serverName;

    return (
      <Tooltip key={serverName} open={isOpen} onOpenChange={() => {}}>
        <TooltipTrigger asChild>
          <PromptInputButton
            data-tool-button
            className="w-[fit-content]"
            size="sm"
            variant="outline"
            onClick={() => {
              setOpenTooltip(isOpen ? null : serverName);
            }}
          >
            <span className="font-medium text-xs text-foreground">
              {serverName}
            </span>
            <span className="text-muted-foreground text-xs">
              ({enabledTools.length}/{totalToolsCount})
            </span>
          </PromptInputButton>
        </TooltipTrigger>
        <TooltipContent
          ref={tooltipContentRef}
          side="top"
          align="center"
          className="min-w-80 max-h-96 p-0 overflow-y-auto"
          sideOffset={4}
          noArrow
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onPointerDownOutside={(e) => {
            e.preventDefault();
          }}
        >
          <ScrollArea className="max-h-96">
            {/* Enabled section */}
            {enabledTools.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {readOnly
                      ? `Tools (${enabledTools.length})`
                      : `Enabled (${enabledTools.length})`}
                  </span>
                  {!readOnly && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={(e) =>
                        handleDisableAll(
                          enabledTools.map((t) => t.id),
                          e,
                        )
                      }
                    >
                      Disable All
                    </Button>
                  )}
                </div>
                <div className="space-y-1 px-2 pb-2">
                  {enabledTools.map((tool) => renderToolRow(tool, false))}
                </div>
              </div>
            )}

            {/* Disabled section - hide in readOnly mode */}
            {!readOnly && disabledTools.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Disabled ({disabledTools.length})
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={(e) =>
                      handleEnableAll(
                        disabledTools.map((t) => t.id),
                        e,
                      )
                    }
                  >
                    Enable All
                  </Button>
                </div>
                <div className="space-y-1 px-2 pb-2">
                  {disabledTools.map((tool) => renderToolRow(tool, true))}
                </div>
              </div>
            )}
          </ScrollArea>
        </TooltipContent>
      </Tooltip>
    );
  });

  // Render agent delegation buttons
  const agentButtons = agentToolsWithNames.map((tool) => {
    const isEnabled = enabledToolIdsSet.has(tool.id);

    if (readOnly) {
      return (
        <Button
          key={tool.id}
          variant="outline"
          size="sm"
          className="h-8 px-2 gap-1.5 text-xs"
          disabled
        >
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <Bot className="h-3 w-3" />
          <span>{tool.displayName}</span>
        </Button>
      );
    }

    return (
      <Tooltip key={tool.id}>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 px-2 gap-1.5 text-xs",
              !isEnabled && "opacity-60",
            )}
            onClick={() => handleToggleAgentTool(tool.id)}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isEnabled ? "bg-green-500" : "bg-red-500",
              )}
            />
            <Bot className="h-3 w-3" />
            <span>{tool.displayName}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {isEnabled
              ? `Click to disable ${tool.displayName}`
              : `Click to enable ${tool.displayName}`}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  });

  return (
    <TooltipProvider>
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        {toolButtons}
        {agentButtons}
        {addAgentsButton}
      </div>
    </TooltipProvider>
  );
}
