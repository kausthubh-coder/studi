import { NextRequest } from "next/server";
import { getSignedPreviewUrl } from "@/lib/daytona/server";
import { isPreviewablePort } from "@/lib/lab/preview";
import { requireLabSession } from "@/lib/server/lab-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORWARDED_HEADERS = [
  "content-type",
  "cache-control",
  "etag",
  "last-modified",
  "content-encoding",
];

function appendProxyPath(baseUrl: string, pathSegments: string[]) {
  const url = new URL(baseUrl);
  const trimmed = url.pathname.replace(/\/+$/, "");
  const suffix = pathSegments.length > 0 ? `/${pathSegments.join("/")}` : "";
  url.pathname = `${trimmed}${suffix}`;
  return url;
}

async function proxyPreview(
  request: NextRequest,
  params: {
    threadId: string;
    port: string;
    path?: string[];
  },
  headOnly: boolean,
) {
  const port = Number.parseInt(params.port, 10);
  if (!Number.isFinite(port) || !isPreviewablePort(port)) {
    return new Response("Invalid preview port.", { status: 400 });
  }

  try {
    const { session } = await requireLabSession(params.threadId);
    const preview = await getSignedPreviewUrl({
      sandboxId: session.sandboxId,
      port,
      expiresInSeconds: 3600,
    });

    const upstreamUrl = appendProxyPath(preview.url, params.path ?? []);
    upstreamUrl.search = request.nextUrl.search;

    const upstream = await fetch(upstreamUrl, {
      method: headOnly ? "HEAD" : "GET",
      headers: {
        "X-Daytona-Skip-Preview-Warning": "true",
      },
      cache: "no-store",
    });

    if (!upstream.ok) {
      return new Response(
        `Preview upstream failed with status ${upstream.status}.`,
        { status: 502 },
      );
    }

    const headers = new Headers();
    headers.set("Cache-Control", "no-store");
    for (const headerName of FORWARDED_HEADERS) {
      const value = upstream.headers.get(headerName);
      if (value) {
        headers.set(headerName, value);
      }
    }

    return new Response(headOnly ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Unable to proxy preview.",
      { status: 401 },
    );
  }
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      threadId: string;
      port: string;
      path?: string[];
    }>;
  },
) {
  return await proxyPreview(request, await context.params, false);
}

export async function HEAD(
  request: NextRequest,
  context: {
    params: Promise<{
      threadId: string;
      port: string;
      path?: string[];
    }>;
  },
) {
  return await proxyPreview(request, await context.params, true);
}
