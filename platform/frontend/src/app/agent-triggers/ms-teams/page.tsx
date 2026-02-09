"use client";

import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { MsTeamsSetupDialog } from "@/components/ms-teams-setup-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAllProfileTools } from "@/lib/agent-tools.query";
import { useChatOpsStatus } from "@/lib/chatops.query";
import { useFeatures } from "@/lib/features.query";
import { useMcpServers } from "@/lib/mcp-server.query";
import { useHostReachability } from "@/lib/reachability.query";

export default function MsTeamsPage() {
  const router = useRouter();
  const [msTeamsSetupOpen, setMsTeamsSetupOpen] = useState(false);
  const [ngrokDialogOpen, setNgrokDialogOpen] = useState(false);

  const { data: features } = useFeatures();
  const { data: chatOpsProviders } = useChatOpsStatus();
  const { data: mcpServers } = useMcpServers();

  const ngrokDomain = features?.ngrokDomain;
  const currentHost =
    typeof window !== "undefined" ? window.location.hostname : "";
  const { data: hostReachable } = useHostReachability(currentHost);
  const isReachable = !!ngrokDomain || !!hostReachable;

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
        title="Make Archestra reachable from the Internet"
        description="The MS Teams bot needs to connect to an Archestra webhook — your instance must be publicly accessible"
        done={isReachable}
        ctaLabel="Configure ngrok"
        onAction={() => setNgrokDialogOpen(true)}
      >
        {ngrokDomain ? (
          <>
            Ngrok domain{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">
              {ngrokDomain}
            </code>{" "}
            is configured.
          </>
        ) : hostReachable ? (
          <>
            <code className="bg-muted px-1 py-0.5 rounded text-xs">
              {`https://${currentHost}`}
            </code>{" "}
            is reachable from the Internet.
          </>
        ) : (
          <>
            Your instance is not reachable from the Internet. Configure ngrok or
            deploy to a public URL.
          </>
        )}
      </SetupStep>
      <SetupStep
        stepNumber={2}
        title="Connect Microsoft Teams"
        description="Allow agents to be triggered via Teams"
        done={!!msTeams?.configured}
        ctaLabel="Setup MS Teams"
        onAction={() => setMsTeamsSetupOpen(true)}
      >
        <p>
          Register a Teams bot application and enter its credentials so
          Archestra can receive and respond to messages.
        </p>
        <div className="flex items-center flex-wrap gap-4 pt-2">
          <CredentialField label="App ID" value={msTeams?.credentials?.appId} />
          <CredentialField
            label="App Secret"
            value={msTeams?.credentials?.appSecret}
          />
          <CredentialField
            label="Tenant ID"
            value={msTeams?.credentials?.tenantId}
            optional
          />
          {msTeams?.configured && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => setMsTeamsSetupOpen(true)}
            >
              Setup again
            </Button>
          )}
        </div>
      </SetupStep>
      <SetupStep
        stepNumber={3}
        title="Install GitHub MCP Server"
        description="Add GitHub tools to your platform"
        done={!!githubServer}
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
      <NgrokSetupDialog
        open={ngrokDialogOpen}
        onOpenChange={setNgrokDialogOpen}
      />
    </div>
  );
}

function NgrokSetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [authToken, setAuthToken] = useState("");

  const dockerCommand = `docker run -p 9000:9000 -p 3000:3000 \\
  -e ARCHESTRA_QUICKSTART=true \\
  -e ARCHESTRA_NGROK_AUTH_TOKEN=${authToken || "<your-ngrok-auth-token>"} \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v archestra-postgres-data:/var/lib/postgresql/data \\
  -v archestra-app-data:/app/data \\
  archestra/platform`;

  const ngrokCommand = `ngrok http --authtoken=${authToken || "<your-ngrok-auth-token>"} 9000`;

  const envCommand =
    "ARCHESTRA_NGROK_DOMAIN=<your-ngrok-domain>.ngrok-free.dev";

  const handleOpenChange = (value: boolean) => {
    onOpenChange(value);
    if (!value) {
      setStep(1);
      setAuthToken("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Enter your ngrok auth token</DialogTitle>
              <DialogDescription>
                Get one at{" "}
                <Link
                  href="https://dashboard.ngrok.com/get-started/your-authtoken"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  ngrok.com
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input
                placeholder="ngrok auth token"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
              />
              <Button
                className="w-full"
                disabled={!authToken.trim()}
                onClick={() => setStep(2)}
              >
                Continue
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Run Archestra with ngrok</DialogTitle>
              <DialogDescription>
                Choose how you want to set up ngrok with Archestra.
              </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="docker">
              <TabsList className="w-full">
                <TabsTrigger value="docker">Docker</TabsTrigger>
                <TabsTrigger value="local">Local Development</TabsTrigger>
              </TabsList>
              <TabsContent value="docker" className="space-y-3 pt-2">
                <div className="relative">
                  <pre className="bg-muted rounded-md p-4 text-xs overflow-x-auto whitespace-pre">
                    {dockerCommand}
                  </pre>
                  <div className="absolute top-2 right-2">
                    <CopyButton text={dockerCommand} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Then open{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">
                    localhost:3000
                  </code>
                </p>
              </TabsContent>
              <TabsContent value="local" className="space-y-3 pt-2">
                <div className="space-y-2 text-sm">
                  <p>
                    1. Start an ngrok tunnel pointing to your local Archestra
                    instance:
                  </p>
                  <div className="relative">
                    <pre className="bg-muted rounded-md p-4 text-xs overflow-x-auto whitespace-pre">
                      {ngrokCommand}
                    </pre>
                    <div className="absolute top-2 right-2">
                      <CopyButton text={ngrokCommand} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <p>
                    2. Set the ngrok domain in your{" "}
                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                      .env
                    </code>{" "}
                    file:
                  </p>
                  <div className="relative">
                    <pre className="bg-muted rounded-md p-4 text-xs overflow-x-auto whitespace-pre">
                      {envCommand}
                    </pre>
                    <div className="absolute top-2 right-2">
                      <CopyButton text={envCommand} />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Then restart Archestra with{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">tilt up</code>
                </p>
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SetupStep({
  title,
  description,
  done,
  ctaLabel,
  onAction,
  children,
}: {
  stepNumber: number;
  title: string;
  description: string;
  done: boolean;
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
            {!done && onAction ? (
              <Button variant="outline" onClick={onAction}>
                {ctaLabel}
              </Button>
            ) : !done ? (
              <span className="text-muted-foreground text-sm">{ctaLabel}</span>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2 text-sm">{children}</CardContent>
    </Card>
  );
}

function CredentialField({
  label,
  value,
  optional,
}: {
  label: string;
  value?: string;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {label}
        {optional && " (optional)"}:
      </span>
      <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
        {value || "Not set"}
      </code>
    </div>
  );
}
