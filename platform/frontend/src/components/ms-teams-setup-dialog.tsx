"use client";

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import * as React from "react";
import { useRef, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      video: "/ms-teams/create-azure-bot.mp4",
      instructions: [
        <>
          Create a folder with <strong>color.png</strong> (192x192),{" "}
          <strong>outline.png</strong> (32x32), and{" "}
          <strong>manifest.json</strong>
        </>,
        <>
          In the manifest, replace{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            {"{{BOT_MS_APP_ID}}"}
          </code>{" "}
          with your <strong>Microsoft App ID</strong>
        </>,
        <>
          <strong>Zip the folder contents</strong> (not the folder itself)
        </>,
        <>
          See the{" "}
          <StepLink href="https://archestra.ai/docs/platform-ms-teams#teams-app-manifest">
            full manifest template
          </StepLink>{" "}
          in the docs
        </>,
      ],
    },
    {
      title: "Install in Teams",
      video: "/ms-teams/create-azure-bot.mp4",
      instructions: [
        <>
          In Teams, go to <strong>Apps</strong> →{" "}
          <strong>Manage your apps</strong> → <strong>Upload an app</strong>
        </>,
        <>
          Select your <strong>manifest zip</strong> file
        </>,
        <>
          <strong>Add the app</strong> to a team or channel
        </>,
        <>
          Mention the bot in a channel — it will prompt you to select an agent
        </>,
      ],
    },
    {
      title: "Connect to Archestra",
    },
  ];
}

export function MsTeamsSetupDialog({
  open,
  onOpenChange,
}: MsTeamsSetupDialogProps) {
  const { data: features } = useFeatures();
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);

  const steps = React.useMemo(
    () => buildSteps(features?.ngrokDomain ?? ""),
    [features?.ngrokDomain],
  );

  React.useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

  const isFirst = current === 0;
  const isLast = current === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[85vh] max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden max-w-[1400px]! w-[80vw]">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Setup Microsoft Teams</DialogTitle>
          <DialogDescription>
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
          </DialogDescription>
        </DialogHeader>

        {/* Carousel content */}
        <div className="flex-1 min-h-0 [&_[data-slot=carousel-content]]:h-full">
          <Carousel
            setApi={setApi}
            opts={{ watchDrag: false }}
            className="h-full"
          >
            <CarouselContent className="h-full pb-6">
              {steps.map((step, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: items are static
                <CarouselItem key={index} className="h-full">
                  <div className="flex h-full flex-col overflow-y-auto px-6">
                    {index < steps.length - 1 ? (
                      <StepSlide
                        title={step.title}
                        stepNumber={index + 1}
                        video={step.video}
                        instructions={step.instructions}
                        isActive={current === index}
                      />
                    ) : features?.isQuickstart ? (
                      <StepConfigForm />
                    ) : (
                      <StepEnvVarsInfo />
                    )}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>

        {/* Navigation footer */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          <div className="text-sm text-muted-foreground">
            Step {current + 1} of {steps.length}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => api?.scrollPrev()}
              disabled={isFirst}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            {isLast && !features?.isQuickstart && (
              <Button size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            )}
            {!isLast && (
              <Button size="sm" onClick={() => api?.scrollNext()}>
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepSlide({
  title,
  stepNumber,
  video,
  instructions,
  isActive,
}: {
  title: string;
  stepNumber: number;
  video?: string;
  instructions?: React.ReactNode[];
  isActive: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (!videoRef.current) return;
    if (isActive) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  }, [isActive]);

  return (
    <div
      className="grid flex-1 gap-6"
      style={{ gridTemplateColumns: "6fr 4fr" }}
    >
      {/* Video side */}
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

      {/* Instructions side */}
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

function StepConfigForm() {
  const { data: features } = useFeatures();
  const mutation = useUpdateChatOpsConfigInQuickstart();
  const chatops = features?.chatops;

  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [tenantId, setTenantId] = useState("");

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

  return (
    <div
      className="grid flex-1 gap-6"
      style={{ gridTemplateColumns: "6fr 4fr" }}
    >
      {/* Left side — form (matches image position in other steps) */}
      <div className="flex flex-col justify-center gap-5 rounded-lg border bg-muted/30 p-6">
        <div className="space-y-2">
          <Label htmlFor="setup-app-id">App ID</Label>
          <Input
            id="setup-app-id"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder={
              chatops?.msTeamsAppId ? "Value already set" : "Azure Bot App ID"
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
              chatops?.msTeamsAppSecret
                ? "Value already set"
                : "Azure Bot App Secret"
            }
          />
        </div>

        <div className="space-y-2">
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
              chatops?.msTeamsTenantId
                ? "Value already set"
                : "Azure AD Tenant ID — only for single-tenant bots"
            }
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="w-full mt-2"
          size="lg"
        >
          {mutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Save & Activate
        </Button>
      </div>

      {/* Right side — instructions (matches instruction position in other steps) */}
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

function StepEnvVarsInfo() {
  return (
    <div
      className="grid flex-1 gap-6"
      style={{ gridTemplateColumns: "7fr 3fr" }}
    >
      {/* Left side — env vars info */}
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

      {/* Right side — instructions */}
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
