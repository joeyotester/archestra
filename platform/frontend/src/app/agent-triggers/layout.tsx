"use client";

import { PageLayout } from "@/components/page-layout";
import { useHasPermissions } from "@/lib/auth.query";

export default function AgentTriggersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: canUpdate } = useHasPermissions({
    organization: ["update"],
  });

  if (canUpdate === false) {
    return null;
  }

  return (
    <PageLayout
      title="Agent Triggers"
      description="Configure how external channels like Microsoft Teams and email can invoke your agents"
      tabs={[
        { label: "MS Teams", href: "/agent-triggers/ms-teams" },
        { label: "Email", href: "/agent-triggers/email" },
      ]}
    >
      {children}
    </PageLayout>
  );
}
