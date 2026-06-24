import { describe, expect, it } from "vitest";
import {
  agentRoleDefinitions,
  getRoleForCapability,
  resolveAgentRole,
} from "@/lib/role-router";

describe("role router", () => {
  it("routes capabilities to internal roles while keeping public copy as Studi", () => {
    expect(getRoleForCapability("tutor").key).toBe("studi");
    expect(getRoleForCapability("lab").key).toBe("codi");
    expect(getRoleForCapability("voice").key).toBe("voice");
    expect(getRoleForCapability("track").key).toBe("plan");

    for (const role of Object.values(agentRoleDefinitions)) {
      expect(role.publicName).toBe("Studi");
    }
  });

  it("maps app/thread state to the right role", () => {
    expect(resolveAgentRole().key).toBe("studi");
    expect(resolveAgentRole({ appMode: "voice" }).key).toBe("voice");
    expect(resolveAgentRole({ voiceSessionActive: true }).key).toBe("voice");
    expect(resolveAgentRole({ appMode: "lab" }).key).toBe("codi");
    expect(resolveAgentRole({ labSessionActive: true }).key).toBe("codi");
    expect(resolveAgentRole({ appMode: "track" }).key).toBe("plan");
    expect(resolveAgentRole({ trackPlanningActive: true }).key).toBe("plan");
  });

  it("lets explicit capability requests override ambient state", () => {
    expect(
      resolveAgentRole({
        requestedCapability: "tutor",
        appMode: "lab",
        labSessionActive: true,
      }).key,
    ).toBe("studi");

    expect(
      resolveAgentRole({
        requestedCapability: "lab",
        appMode: "voice",
        voiceSessionActive: true,
      }).modelRouteKey,
    ).toBe("codiAgent");
  });
});
