import type { JsonValue } from "@/lib/sparks/contracts";
import type { StudiSceneMessage } from "@/lib/sparks/scene-runtime";

export type SceneSessionState = {
  interactions: Record<string, JsonValue>;
  checkpoints: Record<
    string,
    {
      value: JsonValue;
      correct: boolean;
    }
  >;
};

type SceneSessionEntry = SceneSessionState & { updatedAt: number };

const maxSceneSessions = 50;
const maxEntriesPerGroup = 32;
const maxStateStringLength = 256;
const sceneSessions = new Map<string, SceneSessionEntry>();

export function getSceneSessionKey(
  threadId: string | null | undefined,
  sparkInstanceId: string,
): string {
  return `${threadId ?? "threadless"}:${sparkInstanceId}`;
}

function cloneState(entry: SceneSessionEntry): SceneSessionState {
  return {
    interactions: { ...entry.interactions },
    checkpoints: Object.fromEntries(
      Object.entries(entry.checkpoints).map(([id, checkpoint]) => [
        id,
        { ...checkpoint },
      ]),
    ),
  };
}

function entryFor(sessionKey: string): SceneSessionEntry {
  const existing = sceneSessions.get(sessionKey);
  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }

  const created: SceneSessionEntry = {
    interactions: {},
    checkpoints: {},
    updatedAt: Date.now(),
  };
  sceneSessions.set(sessionKey, created);

  if (sceneSessions.size > maxSceneSessions) {
    const oldest = [...sceneSessions.entries()].sort(
      ([, left], [, right]) => left.updatedAt - right.updatedAt,
    )[0]?.[0];
    if (oldest) sceneSessions.delete(oldest);
  }

  return created;
}

function setBoundedValue<T>(record: Record<string, T>, id: string, value: T) {
  if (!(id in record) && Object.keys(record).length >= maxEntriesPerGroup) {
    const oldestId = Object.keys(record)[0];
    if (oldestId) delete record[oldestId];
  }
  record[id] = value;
}

export function recordSceneSessionMessage(
  sessionKey: string,
  message: StudiSceneMessage,
): void {
  if (message.type !== "interaction" && message.type !== "checkpoint") return;

  const id = message.payload?.id;
  if (typeof id !== "string" || !id.trim()) return;
  const boundedId = id.trim().slice(0, 80);

  const entry = entryFor(sessionKey);
  const rawValue = message.payload?.value ?? null;
  const value: JsonValue =
    typeof rawValue === "string"
      ? rawValue.slice(0, maxStateStringLength)
      : typeof rawValue === "number" && !Number.isFinite(rawValue)
        ? null
        : rawValue;
  if (message.type === "interaction") {
    setBoundedValue(entry.interactions, boundedId, value);
  } else {
    setBoundedValue(entry.checkpoints, boundedId, {
      value,
      correct: message.payload?.correct === true,
    });
  }
  entry.updatedAt = Date.now();
}

export function getSceneSessionState(
  sessionKey: string,
): SceneSessionState | null {
  const entry = sceneSessions.get(sessionKey);
  if (!entry) return null;
  entry.updatedAt = Date.now();
  return cloneState(entry);
}
