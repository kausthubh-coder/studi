import type { HostToken, SandboxSession } from "@codesandbox/sdk";

export type SerializedHostToken = {
  sandboxId: string;
  token: string;
  tokenId: string;
  expiresAtMs: number | null;
  lastUsedAtMs: number | null;
};

export type SerializedSandboxSession = Omit<SandboxSession, "hostToken"> & {
  hostToken?: SerializedHostToken;
};

export function serializeHostToken(hostToken: HostToken): SerializedHostToken {
  return {
    sandboxId: hostToken.sandboxId,
    token: hostToken.token,
    tokenId: hostToken.tokenId,
    expiresAtMs: hostToken.expiresAt?.getTime() ?? null,
    lastUsedAtMs: hostToken.lastUsedAt?.getTime() ?? null,
  };
}

export function deserializeHostToken(
  hostToken: SerializedHostToken,
): HostToken {
  return {
    sandboxId: hostToken.sandboxId,
    token: hostToken.token,
    tokenId: hostToken.tokenId,
    expiresAt:
      hostToken.expiresAtMs === null ? null : new Date(hostToken.expiresAtMs),
    lastUsedAt:
      hostToken.lastUsedAtMs === null ? null : new Date(hostToken.lastUsedAtMs),
  };
}

export function serializeSandboxSession(
  session: SandboxSession,
): SerializedSandboxSession {
  return {
    ...session,
    hostToken: session.hostToken
      ? serializeHostToken(session.hostToken)
      : undefined,
  };
}

export function deserializeSandboxSession(
  session: SerializedSandboxSession,
): SandboxSession {
  return {
    ...session,
    hostToken: session.hostToken
      ? deserializeHostToken(session.hostToken)
      : undefined,
  };
}
