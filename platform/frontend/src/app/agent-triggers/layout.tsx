"use client";

import { PageLayout } from "@/components/page-layout";

export default function AgentTriggersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
