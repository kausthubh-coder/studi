const DEFAULT_HOST = "https://us.i.posthog.com";

type CaptureParams = {
  event: string;
  distinctId?: string;
  properties?: Record<string, unknown>;
  groups?: Record<string, string>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function sanitizeValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item));
  }

  if (isObject(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      const sanitized = sanitizeValue(raw);
      if (sanitized !== undefined) {
        next[key] = sanitized;
      }
    }
    return next;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export async function capturePosthogEvent(
  params: CaptureParams,
): Promise<void> {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) {
    return;
  }

  const host = (process.env.POSTHOG_HOST ?? DEFAULT_HOST).replace(/\/+$/, "");
  const endpoint = `${host}/i/v0/e/`;

  const properties = isObject(params.properties)
    ? ((sanitizeValue(params.properties) as Record<string, unknown>) ?? {})
    : {};

  if (params.groups && Object.keys(params.groups).length > 0) {
    properties.$groups = params.groups;
  }

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        event: params.event,
        properties: {
          distinct_id: params.distinctId ?? "system",
          ...properties,
        },
      }),
    });
  } catch (error) {
    console.error("PostHog capture failed", error);
  }
}
