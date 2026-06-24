import type { ModelRouteKey } from "./model-config";

export type AgentCapability = "tutor" | "lab" | "voice" | "track";

export type AgentRoleKey = "studi" | "codi" | "voice" | "plan";

export type RoleRouterState = {
  requestedCapability?: AgentCapability;
  appMode?: "chat" | "lab" | "voice" | "track";
  labSessionActive?: boolean;
  voiceSessionActive?: boolean;
  trackPlanningActive?: boolean;
};

export type AgentRoleDefinition = {
  key: AgentRoleKey;
  capability: AgentCapability;
  modelRouteKey: ModelRouteKey;
  agentName: string;
  publicName: "Studi";
  summary: string;
};

export const agentRoleDefinitions: Readonly<
  Record<AgentRoleKey, AgentRoleDefinition>
> = Object.freeze({
  studi: {
    key: "studi",
    capability: "tutor",
    modelRouteKey: "studiAgent",
    agentName: "studi",
    publicName: "Studi",
    summary: "Default intuition-first tutor role.",
  },
  codi: {
    key: "codi",
    capability: "lab",
    modelRouteKey: "codiAgent",
    agentName: "studi-codi",
    publicName: "Studi",
    summary: "Internal lab specialist role for future coding workspaces.",
  },
  voice: {
    key: "voice",
    capability: "voice",
    modelRouteKey: "voiceAgent",
    agentName: "studi-voice",
    publicName: "Studi",
    summary: "Internal voice-mode role with text fallback support.",
  },
  plan: {
    key: "plan",
    capability: "track",
    modelRouteKey: "planAgent",
    agentName: "studi-plan",
    publicName: "Studi",
    summary: "Internal track and learning-plan planning role.",
  },
});

const roleKeyByCapability: Record<AgentCapability, AgentRoleKey> = {
  tutor: "studi",
  lab: "codi",
  voice: "voice",
  track: "plan",
};

export function getRoleForCapability(
  capability: AgentCapability,
): AgentRoleDefinition {
  return agentRoleDefinitions[roleKeyByCapability[capability]];
}

export function resolveAgentRole(
  state: RoleRouterState = {},
): AgentRoleDefinition {
  if (state.requestedCapability) {
    return getRoleForCapability(state.requestedCapability);
  }

  if (state.appMode === "voice" || state.voiceSessionActive) {
    return agentRoleDefinitions.voice;
  }

  if (state.appMode === "lab" || state.labSessionActive) {
    return agentRoleDefinitions.codi;
  }

  if (state.appMode === "track" || state.trackPlanningActive) {
    return agentRoleDefinitions.plan;
  }

  return agentRoleDefinitions.studi;
}
