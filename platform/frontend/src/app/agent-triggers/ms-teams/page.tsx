"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MsTeamsSetupDialog } from "@/components/ms-teams-setup-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAllProfileTools } from "@/lib/agent-tools.query";
import { useChatOpsStatus } from "@/lib/chatops.query";
import { useFeatures } from "@/lib/features.query";
import { useMcpServers } from "@/lib/mcp-server.query";

export default function MsTeamsPage() {
  const router = useRouter();
  const [msTeamsSetupOpen, setMsTeamsSetupOpen] = useState(false);

  const { data: features } = useFeatures();
  const { data: chatOpsProviders } = useChatOpsStatus();
  const { data: mcpServers } = useMcpServers();

  const ngrokDomain = features?.ngrokDomain;
  const currentHost =
    typeof window !== "undefined" ? window.location.hostname : "";
  const isLocalhostHost =
    currentHost === "localhost" || currentHost === "127.0.0.1";
  const isReachable = !!ngrokDomain || !isLocalhostHost;
  const reachableUrl = ngrokDomain
    ? `https://${ngrokDomain}`
    : !isLocalhostHost
      ? window.location.origin
      : undefined;

  const msTeams = chatOpsProviders?.find((p) => p.id === "ms-teams");
  const githubServer = mcpServers?.find((s) =>
    s.name.toLowerCase().includes("github"),
  );

  const { data: profileToolsData } = useAllProfileTools({
    skipPagination: true,
    enabled: !!githubServer,
  });

  const hasGithubTools =
    !!githubServer &&
    !!profileToolsData?.data?.some(
      (t) =>
        t.credentialSourceMcpServerId === githubServer.id ||
        t.executionSourceMcpServerId === githubServer.id,
    );

  return (
    <div className="flex flex-col gap-6">
      <SetupStep
        stepNumber={1}
        title="Make Archestra Reachable from the Internet"
        description="The MS Teams bot needs to connect to an Archestra webhook — your instance must be publicly accessible"
        done={isReachable}
        doneLabel={reachableUrl ? `Reachable at ${reachableUrl}` : "Reachable"}
        ctaLabel="Configure ngrok"
      >
        Use ngrok or deploy Archestra to a public URL so Microsoft Teams can
        deliver webhook events to your instance.
      </SetupStep>
      <SetupStep
        stepNumber={2}
        title="Connect Microsoft Teams"
        description="Allow agents to be triggered via Teams"
        done={!!msTeams?.configured}
        doneLabel="Connected"
        ctaLabel="Setup MS Teams"
        onAction={() => setMsTeamsSetupOpen(true)}
      >
        Register a Teams bot application and enter its credentials so Archestra
        can receive and respond to messages.
      </SetupStep>
      <SetupStep
        stepNumber={3}
        title="Install GitHub MCP Server"
        description="Add GitHub tools to your platform"
        done={!!githubServer}
        doneLabel="Installed"
        ctaLabel="Install MCP Server"
        onAction={() => router.push("/mcp-catalog/registry")}
      >
        Install the GitHub MCP server from the registry to make GitHub API tools
        available for your agents.
      </SetupStep>
      <SetupStep
        stepNumber={4}
        title="Connect Tools to Agent"
        description="Assign GitHub tools to an agent"
        done={hasGithubTools}
        doneLabel="Configured"
        ctaLabel="Assign Tools"
        onAction={() => router.push("/agents")}
      >
        Assign the GitHub tools to one or more agents so they can interact with
        repositories, issues, and pull requests.
      </SetupStep>

      <MsTeamsSetupDialog
        open={msTeamsSetupOpen}
        onOpenChange={setMsTeamsSetupOpen}
      />
    </div>
  );
}

function SetupStep({
  title,
  description,
  done,
  doneLabel,
  ctaLabel,
  onAction,
  children,
}: {
  stepNumber: number;
  title: string;
  description: string;
  done: boolean;
  doneLabel: string;
  ctaLabel: string;
  onAction?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Card className="py-4 gap-0">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 border-b pb-4">
          <CardTitle>
            <div className="flex items-center gap-4">
              {done ? (
                <CheckCircle2 className="size-5 shrink-0 text-green-500" />
              ) : (
                <Circle className="text-muted-foreground size-5 shrink-0" />
              )}
              <div className="flex flex-col gap-1">
                <div className="font-medium">{title}</div>
                <div className="text-muted-foreground text-xs">
                  {description}
                </div>
              </div>
            </div>
          </CardTitle>
          <div className="shrink-0">
            {done ? (
              <span className="text-sm font-medium text-green-500">
                {doneLabel}
              </span>
            ) : onAction ? (
              <Button variant="outline" onClick={onAction}>
                {ctaLabel}
              </Button>
            ) : (
              <span className="text-muted-foreground text-sm">{ctaLabel}</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2 text-sm">{children}</CardContent>
    </Card>
  );
}
