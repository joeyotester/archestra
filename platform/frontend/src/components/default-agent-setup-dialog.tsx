"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { SetupDialog } from "@/components/setup-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProfiles } from "@/lib/agent.query";
import { useChatOpsBindings } from "@/lib/chatops.query";

interface DefaultAgentSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DefaultAgentSetupDialog({
  open,
  onOpenChange,
}: DefaultAgentSetupDialogProps) {
  return (
    <SetupDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Choose Default Agent for MS Teams"
      description="Each MS Teams channel needs a default agent to handle incoming messages. Use the /select-agent command in Teams to bind an agent to a channel."
      steps={[
        <StepInviteBot key="invite" />,
        <StepVerifyBindings key="verify" />,
      ]}
    />
  );
}

function StepInviteBot() {
  return (
    <div
      className="grid flex-1 gap-6"
      style={{ gridTemplateColumns: "6fr 4fr" }}
    >
      <div className="flex justify-center items-center rounded-lg border bg-muted/30 p-2 relative">
        <video
          src="/ms-teams/agent-bound.mp4"
          controls
          muted
          playsInline
          className="rounded-md w-full h-full object-contain"
        />
      </div>

      <div className="flex flex-col gap-4 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            Step 1
          </Badge>
          <h3 className="text-lg font-semibold">Select an Agent in Teams</h3>
        </div>
        <ol className="space-y-3">
          <li className="flex gap-3 text-sm leading-relaxed">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              1
            </span>
            <span className="pt-0.5">
              Open Microsoft Teams and navigate to the channel where the bot is
              installed
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-relaxed">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              2
            </span>
            <span className="pt-0.5">
              Mention the bot (e.g., <strong>@Archestra</strong>) or type{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">
                /select-agent
              </code>
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-relaxed">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              3
            </span>
            <span className="pt-0.5">
              Choose an agent from the selection card that appears
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}

function StepVerifyBindings() {
  const queryClient = useQueryClient();
  const { data: bindings, isLoading } = useChatOpsBindings();
  const { data: agents } = useProfiles();

  const agentMap = new Map(agents?.map((a) => [a.id, a.name]) ?? []);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["chatops", "bindings"] });
  };

  return (
    <div
      className="grid flex-1 gap-6"
      style={{ gridTemplateColumns: "6fr 4fr" }}
    >
      <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-6">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Channel Bindings</h4>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="text-xs h-7"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading bindings...</p>
        ) : bindings && bindings.length > 0 ? (
          <div className="space-y-2">
            {bindings.map((binding) => (
              <div
                key={binding.id}
                className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs text-muted-foreground">
                    Channel: {binding.channelId.slice(0, 20)}...
                  </span>
                </div>
                <Badge variant="secondary">
                  {binding.agentId
                    ? (agentMap.get(binding.agentId) ?? "Unknown agent")
                    : "No agent assigned"}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No bindings yet. Use the{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">
                /select-agent
              </code>{" "}
              command in Teams to create one.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            Step 2
          </Badge>
          <h3 className="text-lg font-semibold">Verify Agent Binding</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          After selecting an agent in Teams, the binding will appear here. Each
          channel can have one default agent.
        </p>
        <ol className="space-y-3">
          <li className="flex gap-3 text-sm leading-relaxed">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              1
            </span>
            <span className="pt-0.5">
              Run{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">
                /select-agent
              </code>{" "}
              in a Teams channel
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-relaxed">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              2
            </span>
            <span className="pt-0.5">
              Click <strong>Refresh</strong> to see the new binding
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-relaxed">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              3
            </span>
            <span className="pt-0.5">
              Mention the bot in that channel to start chatting with the agent
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}
