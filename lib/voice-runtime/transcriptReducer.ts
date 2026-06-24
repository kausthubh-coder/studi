import {
  isVoiceTranscriptRole,
  type VoicePersistedTurn,
  type VoiceToolActivity,
  type VoiceToolName,
  type VoiceTranscriptRole,
  type VoiceTranscriptTurn,
} from "./contracts";

export type VoiceTranscriptState = {
  turns: VoiceTranscriptTurn[];
  draftByItemId: Record<string, VoiceTranscriptTurn>;
  toolActivities: VoiceToolActivity[];
  error?: string;
};

export const initialVoiceTranscriptState: VoiceTranscriptState = {
  turns: [],
  draftByItemId: {},
  toolActivities: [],
};

export type RealtimeTranscriptEvent =
  | {
      type: "conversation.item.input_audio_transcription.delta";
      event_id?: string;
      item_id: string;
      delta?: string;
    }
  | {
      type: "conversation.item.input_audio_transcription.completed";
      event_id?: string;
      item_id: string;
      transcript?: string;
    }
  | {
      type: "response.output_audio_transcript.delta";
      event_id?: string;
      item_id?: string;
      delta?: string;
    }
  | {
      type: "response.output_audio_transcript.done";
      event_id?: string;
      item_id?: string;
      transcript?: string;
    }
  | {
      type: "response.done";
      event_id?: string;
      response?: {
        output?: Array<{
          id?: string;
          type?: string;
          role?: VoiceTranscriptRole;
          content?: Array<{ transcript?: string; text?: string }>;
          name?: VoiceToolName;
          call_id?: string;
          arguments?: string;
        }>;
      };
    }
  | {
      type: "error";
      error?: { message?: string };
    };

function appendText(existing: string, delta: string): string {
  if (!delta) return existing;
  if (!existing) return delta;
  return `${existing}${delta}`;
}

function upsertDraft(
  state: VoiceTranscriptState,
  params: {
    role: VoiceTranscriptRole;
    itemId: string;
    text: string;
    isFinal: boolean;
    providerEventId?: string;
    now: number;
  },
): VoiceTranscriptState {
  const existing =
    state.draftByItemId[params.itemId] ??
    state.turns.find((turn) => turn.itemId === params.itemId);
  const nextTurn: VoiceTranscriptTurn = {
    role: params.role,
    itemId: params.itemId,
    text: params.isFinal
      ? params.text.trim()
      : appendText(existing?.text ?? "", params.text),
    isFinal: params.isFinal,
    startedAt: existing?.startedAt ?? params.now,
    committedAt: params.isFinal ? params.now : existing?.committedAt,
    providerEventId: params.providerEventId ?? existing?.providerEventId,
  };

  if (!nextTurn.text) {
    return state;
  }

  const turns = params.isFinal
    ? [
        ...state.turns.filter((turn) => turn.itemId !== params.itemId),
        nextTurn,
      ]
    : state.turns;
  const draftByItemId = { ...state.draftByItemId };

  if (params.isFinal) {
    delete draftByItemId[params.itemId];
  } else {
    draftByItemId[params.itemId] = nextTurn;
  }

  return {
    ...state,
    turns,
    draftByItemId,
  };
}

function appendResponseOutput(
  state: VoiceTranscriptState,
  event: Extract<RealtimeTranscriptEvent, { type: "response.done" }>,
  now: number,
): VoiceTranscriptState {
  let nextState = state;

  for (const output of event.response?.output ?? []) {
    if (output.type === "function_call" && output.name) {
      const id = output.call_id ?? output.id ?? `${output.name}-${now}`;
      const activity: VoiceToolActivity = {
        id,
        name: output.name,
        label:
          output.name === "create_spark"
            ? "Create Spark"
            : output.name === "open_lab"
              ? "Open Lab"
              : "Hand off to text",
        status: output.name === "open_lab" ? "pending_adapter" : "pending",
        summary:
          output.name === "open_lab"
            ? "Labs are not available in this branch yet."
            : undefined,
      };
      nextState = {
        ...nextState,
        toolActivities: [
          ...nextState.toolActivities.filter((tool) => tool.id !== id),
          activity,
        ],
      };
      continue;
    }

    if (output.type !== "message") {
      continue;
    }

    const role = isVoiceTranscriptRole(output.role) ? output.role : "assistant";
    const text = (output.content ?? [])
      .map((part) => part.transcript ?? part.text ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      continue;
    }

    nextState = upsertDraft(nextState, {
      role,
      itemId: output.id ?? `${role}-${now}`,
      text,
      isFinal: true,
      providerEventId: event.event_id,
      now,
    });
  }

  return nextState;
}

export function reduceVoiceTranscriptEvent(
  state: VoiceTranscriptState,
  event: RealtimeTranscriptEvent,
  now = Date.now(),
): VoiceTranscriptState {
  if (event.type === "error") {
    return {
      ...state,
      error: event.error?.message ?? "Realtime voice error.",
    };
  }

  if (event.type === "conversation.item.input_audio_transcription.delta") {
    return upsertDraft(state, {
      role: "user",
      itemId: event.item_id,
      text: event.delta ?? "",
      isFinal: false,
      providerEventId: event.event_id,
      now,
    });
  }

  if (event.type === "conversation.item.input_audio_transcription.completed") {
    return upsertDraft(state, {
      role: "user",
      itemId: event.item_id,
      text: event.transcript ?? "",
      isFinal: true,
      providerEventId: event.event_id,
      now,
    });
  }

  if (event.type === "response.output_audio_transcript.delta") {
    return upsertDraft(state, {
      role: "assistant",
      itemId: event.item_id ?? "assistant-draft",
      text: event.delta ?? "",
      isFinal: false,
      providerEventId: event.event_id,
      now,
    });
  }

  if (event.type === "response.output_audio_transcript.done") {
    return upsertDraft(state, {
      role: "assistant",
      itemId: event.item_id ?? "assistant-draft",
      text: event.transcript ?? "",
      isFinal: true,
      providerEventId: event.event_id,
      now,
    });
  }

  return appendResponseOutput(state, event, now);
}

export function selectVoiceTranscriptPreview(
  state: VoiceTranscriptState,
): VoiceTranscriptTurn[] {
  return [
    ...state.turns,
    ...Object.values(state.draftByItemId).filter((turn) => !turn.isFinal),
  ].sort((a, b) => a.startedAt - b.startedAt);
}

export function normalizeVoiceTurnsForPersistence(
  state: VoiceTranscriptState,
): VoicePersistedTurn[] {
  return state.turns
    .filter((turn) => turn.isFinal && turn.text.trim().length > 0)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((turn) => ({
      role: turn.role,
      text: turn.text.trim(),
      providerItemId: turn.itemId,
      providerEventId: turn.providerEventId,
      startedAt: turn.startedAt,
      committedAt: turn.committedAt,
    }));
}
