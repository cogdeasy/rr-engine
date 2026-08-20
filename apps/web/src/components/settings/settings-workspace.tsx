"use client";

import * as React from "react";
import { Tabs } from "@rr/ui";
import type { SettingsSnapshot } from "@rr/types";
import { AccessPanel } from "./access-panel";
import { EscalationPanel } from "./escalation-panel";
import { PlatformPanel } from "./platform-panel";
import { ThresholdPanel } from "./threshold-panel";

export function SettingsWorkspace({ snapshot }: { snapshot: SettingsSnapshot }) {
  const [tab, setTab] = React.useState("access");

  const tabs = [
    { id: "access", label: "Roles & access", count: snapshot.users.length },
    { id: "thresholds", label: "Alerting thresholds", count: snapshot.thresholds.length },
    { id: "escalation", label: "Notification & escalation", count: snapshot.escalations.length },
    { id: "platform", label: "Platform health", count: snapshot.health.integrations.length },
  ];

  return (
    <div className="space-y-5">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "access" ? (
        <AccessPanel roles={snapshot.roles} users={snapshot.users} moduleGroups={snapshot.moduleGroups} />
      ) : null}
      {tab === "thresholds" ? <ThresholdPanel policies={snapshot.thresholds} /> : null}
      {tab === "escalation" ? (
        <EscalationPanel policies={snapshot.escalations} roles={snapshot.roles} users={snapshot.users} />
      ) : null}
      {tab === "platform" ? <PlatformPanel health={snapshot.health} /> : null}
    </div>
  );
}
