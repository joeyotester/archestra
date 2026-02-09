"use client";

import JSZip from "jszip";
import {
  Download,
  ExternalLink,
  Info,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import * as React from "react";
import { useRef, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { SetupDialog } from "@/components/setup-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChatOpsStatus } from "@/lib/chatops.query";
import { useUpdateChatOpsConfigInQuickstart } from "@/lib/chatops-config.query";
import { useFeatures } from "@/lib/features.query";

interface MsTeamsSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ENV_VARS_TEXT = `ARCHESTRA_CHATOPS_MS_TEAMS_ENABLED=true
ARCHESTRA_CHATOPS_MS_TEAMS_APP_ID=<Microsoft App ID>
ARCHESTRA_CHATOPS_MS_TEAMS_APP_SECRET=<Client Secret>
ARCHESTRA_CHATOPS_MS_TEAMS_TENANT_ID=<Tenant ID>`;

export function MsTeamsSetupDialog({
  open,
  onOpenChange,
}: MsTeamsSetupDialogProps) {
  const { data: features } = useFeatures();
  const ngrokDomain = features?.ngrokDomain ?? "";

  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const [canSave, setCanSave] = useState(false);
  const [saving, setSaving] = useState(false);

  const stepContents = React.useMemo(() => {
    const slides = buildSteps(ngrokDomain);
    return slides.map((step, index) => {
      if (step.component === "manifest") {
        return <StepManifest key={step.title} stepNumber={index + 1} />;
      }
      if (index < slides.length - 1) {
        return (
          <StepSlide
            key={step.title}
            title={step.title}
            stepNumber={index + 1}
            video={step.video}
            instructions={step.instructions}
          />
        );
      }
      // Last step
      if (features?.isQuickstart) {
        return (
          <StepConfigForm
            key={step.title}
            saveRef={saveRef}
            onCanSaveChange={setCanSave}
          />
        );
      }
      return <StepEnvVarsInfo key={step.title} />;
    });
  }, [ngrokDomain, features?.isQuickstart]);

  const lastStepAction = features?.isQuickstart
    ? {
        label: saving ? "Connecting..." : "Connect",
        disabled: saving || !canSave,
        loading: saving,
        onClick: async () => {
          if (!saveRef.current) return;
          setSaving(true);
          try {
            await saveRef.current();
            onOpenChange(false);
          } finally {
            setSaving(false);
          }
        },
      }
    : undefined;

  return (
    <SetupDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Setup Microsoft Teams"
      description={
        <>
          Follow these steps to connect your Archestra agents to Microsoft
          Teams. Find out more in our{" "}
          <a
            href="https://archestra.ai/docs/platform-ms-teams"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:no-underline"
          >
            documentation
          </a>
          .
        </>
      }
      steps={stepContents}
      lastStepAction={lastStepAction}
    />
  );
}

function buildSteps(ngrokDomain: string) {
  return [
    {
      title: "Create Azure Bot",
      video: "/ms-teams/create-azure-bot.mp4",
      instructions: [
        <>
          Go to{" "}
          <StepLink href="https://portal.azure.com">portal.azure.com</StepLink>{" "}
          and click <strong>Create a resource</strong>, then search for{" "}
          <strong>Azure Bot</strong>
        </>,
        <>
          Fill in <strong>bot handle</strong>, <strong>subscription</strong>,
          and <strong>resource group</strong> (create one if needed)
        </>,
        <>
          Under <strong>Type of App</strong>, choose{" "}
          <strong>Multi Tenant</strong> (default) or{" "}
          <strong>Single Tenant</strong> for your organization only
        </>,
        <>
          Under <strong>Microsoft App ID</strong>, select{" "}
          <strong>Create new Microsoft App ID</strong>
        </>,
      ],
    },
    {
      title: "Configure Bot Settings",
      video: "/ms-teams/bot-settings.mp4",
      instructions: [
        <>
          After creation, go to newly created <strong>resource</strong> and then
          to <strong>Settings</strong> → <strong>Configuration</strong>
        </>,
        <WebhookUrlInstruction key="webhook-url" ngrokDomain={ngrokDomain} />,
        <>
          Copy the <strong>Microsoft App ID</strong> and save it for later
        </>,
        <>
          Click <strong>Manage Password</strong> →{" "}
          <strong>New client secret</strong> → copy the secret value and save it
          for later too
        </>,
      ],
    },
    {
      title: "Add Teams Channel",
      video: "/ms-teams/team-channel.mp4",
      instructions: [
        <>
          In your Azure Bot resource, go to <strong>Channels</strong>
        </>,
        <>
          Click <strong>Add Microsoft Teams</strong> as a channel
        </>,
        <>
          Accept the terms and save — this enables your bot to communicate with
          Teams
        </>,
      ],
    },
    {
      title: "Create App Manifest",
      component: "manifest" as const,
    },
    {
      title: "Install in Teams",
      video: "/ms-teams/ms-teams-upload-app.mp4",
      instructions: [
        <>
          In Teams, go to <strong>Apps</strong> →{" "}
          <strong>Manage your apps</strong> → <strong>Upload an app</strong>
        </>,
        <>
          Select your <strong>archestra-teams-app.zip</strong> file
        </>,
        <>
          <strong>Add the app</strong> to a team or channel
        </>,
      ],
    },
    {
      title: "Connect to Archestra",
    },
  ];
}

function StepSlide({
  title,
  stepNumber,
  video,
  instructions,
}: {
  title: string;
  stepNumber: number;
  video?: string;
  instructions?: React.ReactNode[];
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  return (
    <div
      className="grid flex-1 gap-6"
      style={{ gridTemplateColumns: "6fr 4fr" }}
    >
      {video && (
        <div className="flex justify-center items-center rounded-lg border bg-muted/30 p-2 relative">
          <video
            ref={videoRef}
            src={video}
            controls
            muted
            playsInline
            className="rounded-md w-full h-full object-contain"
          />
        </div>
      )}

      <div className="flex flex-col gap-4 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            Step {stepNumber}
          </Badge>
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        {instructions && (
          <ol className="space-y-3">
            {instructions.map((instruction, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: items are static
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {i + 1}
                </span>
                <span className="pt-0.5">{instruction}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function StepConfigForm({
  saveRef,
  onCanSaveChange,
}: {
  saveRef: React.MutableRefObject<(() => Promise<void>) | null>;
  onCanSaveChange: (canSave: boolean) => void;
}) {
  const mutation = useUpdateChatOpsConfigInQuickstart();
  const { data: chatOpsProviders } = useChatOpsStatus();
  const msTeams = chatOpsProviders?.find((p) => p.id === "ms-teams");
  const creds = msTeams?.credentials;

  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [tenantId, setTenantId] = useState("");

  const hasAppId = Boolean(appId || creds?.appId);
  const hasAppSecret = Boolean(appSecret || creds?.appSecret);

  React.useEffect(() => {
    onCanSaveChange(hasAppId && hasAppSecret);
  }, [hasAppId, hasAppSecret, onCanSaveChange]);

  const handleSave = async () => {
    const body: Record<string, unknown> = { enabled: true };
    if (appId) body.appId = appId;
    if (appSecret) body.appSecret = appSecret;
    if (tenantId) body.tenantId = tenantId;

    await mutation.mutateAsync(
      body as {
        enabled?: boolean;
        appId?: string;
        appSecret?: string;
        tenantId?: string;
      },
    );

    setAppId("");
    setAppSecret("");
    setTenantId("");
  };

  saveRef.current = handleSave;

  return (
    <div
      className="grid flex-1 gap-6"
      style={{ gridTemplateColumns: "6fr 4fr" }}
    >
      <div className="flex flex-col gap-5 rounded-lg border bg-muted/30 p-6">
        <div className="space-y-2">
          <Label htmlFor="setup-app-id">App ID</Label>
          <Input
            id="setup-app-id"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder={
              creds?.appId ? `Current: ${creds.appId}` : "Azure Bot App ID"
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="setup-app-secret">App Secret</Label>
          <Input
            id="setup-app-secret"
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder={
              creds?.appSecret
                ? `Current: ${creds.appSecret}`
                : "Azure Bot App Secret"
            }
          />
        </div>

        <div className="space-y-2 mb-8">
          <Label htmlFor="setup-tenant-id">
            Tenant ID{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="setup-tenant-id"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder={
              creds?.tenantId
                ? `Current: ${creds.tenantId}`
                : "Azure AD Tenant ID — only for single-tenant bots"
            }
          />
        </div>

        <EnvVarsInfo appId={appId} appSecret={appSecret} tenantId={tenantId} />
      </div>

      <div className="flex flex-col gap-4 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            Step 6
          </Badge>
          <h3 className="text-lg font-semibold">Connect to Archestra</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Enter the credentials you copied from the Azure Bot resource.
        </p>
        <ol className="space-y-3">
          <li className="flex gap-3 text-sm leading-relaxed">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              1
            </span>
            <span className="pt-0.5">
              <strong>App ID</strong> — from the Azure Bot Configuration page
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-relaxed">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              2
            </span>
            <span className="pt-0.5">
              <strong>App Secret</strong> — the client secret you created
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-relaxed">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              3
            </span>
            <span className="pt-0.5">
              <strong>Tenant ID</strong> — only needed for single-tenant bots
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}

function EnvVarsInfo({
  appId,
  appSecret,
  tenantId,
}: {
  appId: string;
  appSecret: string;
  tenantId: string;
}) {
  const envVarsText = [
    `ARCHESTRA_CHATOPS_MS_TEAMS_ENABLED=true`,
    `ARCHESTRA_CHATOPS_MS_TEAMS_APP_ID=${appId || "<your-app-id>"}`,
    `ARCHESTRA_CHATOPS_MS_TEAMS_APP_SECRET=${appSecret || "<your-app-secret>"}`,
    tenantId
      ? `ARCHESTRA_CHATOPS_MS_TEAMS_TENANT_ID=${tenantId}`
      : `ARCHESTRA_CHATOPS_MS_TEAMS_TENANT_ID=<your-tenant-id>`,
  ].join("\n");

  return (
    <div className="flex items-start gap-2.5 rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2.5 text-sm text-muted-foreground">
      <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p>
          Values that are set or edited here are stored in memory and will be
          reset after server restart. For persistent configuration, set these
          environment variables:
        </p>
        <div className="relative mt-2">
          <pre className="bg-muted rounded-md px-3 py-2 text-xs font-mono leading-relaxed overflow-x-auto">
            {envVarsText}
          </pre>
          <div className="absolute top-1 right-1">
            <CopyButton text={envVarsText} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepEnvVarsInfo() {
  return (
    <div
      className="grid flex-1 gap-6"
      style={{ gridTemplateColumns: "7fr 3fr" }}
    >
      <div className="flex flex-col justify-center gap-5 rounded-lg border bg-muted/30 p-6">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Set the following environment variables and restart Archestra to
          enable MS Teams integration.
        </p>
        <div className="relative rounded bg-muted px-4 py-3 font-mono text-sm leading-loose">
          <div className="absolute top-2 right-2">
            <CopyButton text={ENV_VARS_TEXT} />
          </div>
          ARCHESTRA_CHATOPS_MS_TEAMS_ENABLED=true
          <br />
          ARCHESTRA_CHATOPS_MS_TEAMS_APP_ID=&lt;Microsoft App ID&gt;
          <br />
          ARCHESTRA_CHATOPS_MS_TEAMS_APP_SECRET=&lt;Client Secret&gt;
          <br />
          ARCHESTRA_CHATOPS_MS_TEAMS_TENANT_ID=&lt;Tenant ID&gt;
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          After setting these variables, restart Archestra for the changes to
          take effect. The MS Teams toggle will then appear on agents.
        </p>
      </div>

      <div className="flex flex-col gap-4 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            Step 6
          </Badge>
          <h3 className="text-lg font-semibold">Configure Archestra</h3>
        </div>
        <ol className="space-y-3">
          <li className="flex gap-3 text-sm leading-relaxed">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              1
            </span>
            <span className="pt-0.5">
              Set the environment variables shown on the left
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-relaxed">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              2
            </span>
            <span className="pt-0.5">
              <strong>Restart Archestra</strong> for changes to take effect
            </span>
          </li>
          <li className="flex gap-3 text-sm leading-relaxed">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              3
            </span>
            <span className="pt-0.5">
              Edit an agent and enable the <strong>Microsoft Teams</strong>{" "}
              toggle
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}

function buildManifest(botAppId: string) {
  return {
    $schema:
      "https://developer.microsoft.com/json-schemas/teams/v1.16/MicrosoftTeams.schema.json",
    manifestVersion: "1.16",
    version: "1.0.0",
    id: botAppId || "{{BOT_MS_APP_ID}}",
    packageName: "com.archestra.bot",
    developer: {
      name: "Archestra",
      websiteUrl: "https://archestra.ai",
      privacyUrl: "https://archestra.ai/privacy",
      termsOfUseUrl: "https://archestra.ai/terms",
    },
    name: { short: "Archestra", full: "Archestra Bot" },
    description: { short: "Ask Archestra", full: "Chat with Archestra agents" },
    icons: { outline: "outline.png", color: "color.png" },
    accentColor: "#FFFFFF",
    bots: [
      {
        botId: botAppId || "{{BOT_MS_APP_ID}}",
        scopes: ["team", "groupchat"],
        supportsFiles: false,
        isNotificationOnly: false,
        commandLists: [
          {
            scopes: ["team", "groupchat"],
            commands: [
              {
                title: "/select-agent",
                description: "Change which agent handles this channel",
              },
              {
                title: "/status",
                description: "Show current agent for this channel",
              },
              { title: "/help", description: "Show available commands" },
            ],
          },
        ],
      },
    ],
    permissions: ["identity", "messageTeamMembers"],
    validDomains: [],
    webApplicationInfo: {
      id: botAppId || "{{BOT_MS_APP_ID}}",
      resource: "https://graph.microsoft.com",
    },
    authorization: {
      permissions: {
        resourceSpecific: [
          { name: "ChannelMessage.Read.Group", type: "Application" },
          { name: "ChatMessage.Read.Chat", type: "Application" },
        ],
      },
    },
  };
}

function StepManifest({ stepNumber }: { stepNumber: number }) {
  const [botAppId, setBotAppId] = useState("");
  const [downloading, setDownloading] = useState(false);

  const manifest = buildManifest(botAppId);
  const manifestJson = JSON.stringify(manifest, null, 2);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();
      zip.file("manifest.json", manifestJson);

      const [colorRes, outlineRes] = await Promise.all([
        fetch("/ms-teams/color.png"),
        fetch("/ms-teams/outline.png"),
      ]);
      zip.file("color.png", await colorRes.blob());
      zip.file("outline.png", await outlineRes.blob());

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "archestra-teams-app.zip";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="grid flex-1 gap-6"
      style={{ gridTemplateColumns: "6fr 4fr" }}
    >
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 min-h-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            manifest.json
          </span>
          <CopyButton text={manifestJson} />
        </div>
        <pre className="flex-1 overflow-auto rounded bg-muted p-3 text-xs font-mono leading-relaxed min-h-0">
          {manifestJson}
        </pre>
      </div>

      <div className="flex flex-col gap-4 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            Step {stepNumber}
          </Badge>
          <h3 className="text-lg font-semibold">Create App Manifest</h3>
        </div>

        <div className="space-y-2">
          <Label htmlFor="manifest-bot-id">Microsoft App ID</Label>
          <Input
            id="manifest-bot-id"
            value={botAppId}
            onChange={(e) => setBotAppId(e.target.value)}
            placeholder="Paste your Microsoft App ID"
          />
          <p className="text-xs text-muted-foreground">
            The App ID from Step 2. It will be injected into the manifest
            automatically.
          </p>
        </div>

        <Button
          onClick={handleDownload}
          disabled={!botAppId || downloading}
          className="w-full"
        >
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Download archestra-teams-app.zip
        </Button>

        {!botAppId && (
          <span className="flex items-center gap-1 text-xs text-amber-500">
            <TriangleAlert className="h-3 w-3 shrink-0" />
            Enter your Microsoft App ID to generate the manifest
          </span>
        )}
      </div>
    </div>
  );
}

function WebhookUrlInstruction({ ngrokDomain }: { ngrokDomain: string }) {
  const [customDomain, setCustomDomain] = useState("");
  const hasKnownDomain = Boolean(ngrokDomain);
  const domain = hasKnownDomain ? ngrokDomain : customDomain || "your-domain";
  const webhookUrl = `https://${domain}/api/webhooks/chatops/ms-teams`;

  const canCopy = hasKnownDomain || Boolean(customDomain);

  return (
    <>
      Set <strong>Messaging endpoint</strong> to{" "}
      <span className="mt-1 flex items-center gap-1">
        <code className="min-w-0 break-all rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
          {webhookUrl}
        </code>
        <span className="shrink-0">
          {canCopy && <CopyButton text={webhookUrl} />}
        </span>
      </span>
      {!hasKnownDomain && (
        <>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <span className="shrink-0 text-muted-foreground">Your domain:</span>
            <input
              type="text"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="e.g. myapp.example.com"
              className="h-6 rounded border bg-background px-2 text-xs font-mono w-48 placeholder:text-muted-foreground/50"
            />
          </label>
          {!customDomain && (
            <span className="mt-1 flex items-center gap-1 text-xs text-amber-500">
              <TriangleAlert className="h-3 w-3 shrink-0" />
              Enter your public Archestra domain above
            </span>
          )}
        </>
      )}
    </>
  );
}

function StepLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary underline hover:no-underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
