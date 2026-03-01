import type { FunctionReference } from "convex/server";
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

const internalApi = internal as unknown as {
  waitlist: {
    ingestTallyWebhook: FunctionReference<"mutation", "internal">;
  };
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

function toBase64(bytes: Uint8Array): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const triplet = (first << 16) | (second << 8) | third;

    output += chars[(triplet >> 18) & 63];
    output += chars[(triplet >> 12) & 63];
    output += index + 1 < bytes.length ? chars[(triplet >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? chars[triplet & 63] : "=";
  }

  return output;
}

async function computeTallySignature(
  payload: string,
  signingSecret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return toBase64(new Uint8Array(signatureBuffer));
}

async function isAuthorizedRequest(
  request: Request,
  rawBody: string,
  expectedSecret: string,
): Promise<boolean> {
  const tallySignature = request.headers.get("tally-signature");
  if (tallySignature) {
    const expectedSignature = await computeTallySignature(
      rawBody,
      expectedSecret,
    );
    if (tallySignature === expectedSignature) {
      return true;
    }
  }

  const url = new URL(request.url);
  const providedSecret =
    request.headers.get("x-tally-secret") ??
    request.headers.get("x-webhook-secret") ??
    request.headers.get("x-webhook-token") ??
    url.searchParams.get("secret");

  return Boolean(providedSecret && providedSecret === expectedSecret);
}

function extractEmail(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const fields = (data as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) {
    return undefined;
  }

  for (const field of fields) {
    if (!field || typeof field !== "object") {
      continue;
    }

    const typedField = field as {
      type?: unknown;
      key?: unknown;
      value?: unknown;
    };

    const value =
      typeof typedField.value === "string" ? typedField.value.trim() : "";
    if (!value) {
      continue;
    }

    const isEmailType = typedField.type === "INPUT_EMAIL";
    const isEmailKey = typedField.key === "email";
    if ((isEmailType || isEmailKey) && value.includes("@")) {
      return value.toLowerCase();
    }
  }

  return undefined;
}

http.route({
  path: "/webhooks/tally/waitlist",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expectedSecret = process.env.TALLY_WEBHOOK_SECRET;
    if (!expectedSecret) {
      return jsonResponse(
        { error: "Webhook is not configured" },
        500,
      );
    }

    const rawBody = await request.text();
    const isAuthorized = await isAuthorizedRequest(
      request,
      rawBody,
      expectedSecret,
    );
    if (!isAuthorized) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const emailAddress = extractEmail(payload);
    if (!emailAddress) {
      return jsonResponse({ error: "No email field found" }, 400);
    }

    const payloadObject = payload as Record<string, unknown>;
    const payloadData =
      payloadObject.data && typeof payloadObject.data === "object"
        ? (payloadObject.data as Record<string, unknown>)
        : undefined;

    const eventId = pickString(
      payloadObject.eventId,
      payloadObject.event_id,
      payloadObject.id,
      payloadObject.event && typeof payloadObject.event === "object"
        ? (payloadObject.event as Record<string, unknown>).id
        : undefined,
    );

    const submissionId = pickString(
      payloadObject.submissionId,
      payloadObject.submission_id,
      payloadObject.responseId,
      payloadObject.response_id,
      payloadData?.submissionId,
      payloadData?.submission_id,
      payloadData?.responseId,
      payloadData?.response_id,
      payloadData?.id,
    );

    const formId = pickString(
      payloadObject.formId,
      payloadObject.form_id,
      payloadData?.formId,
      payloadData?.form_id,
      payloadData?.form,
    );

    const dedupeKey = eventId
      ? `event:${eventId}`
      : submissionId
        ? `submission:${submissionId}`
        : `payload:${hashString(rawBody)}`;

    const ingestResult = await ctx.runMutation(
      internalApi.waitlist.ingestTallyWebhook,
      {
        dedupeKey,
        eventId,
        submissionId,
        formId,
        emailAddress,
        payload,
        receivedAt: Date.now(),
      },
    );

    return jsonResponse(
      {
        accepted: true,
        deduped: ingestResult.deduped,
      },
      ingestResult.deduped ? 200 : 202,
    );
  }),
});

export default http;
