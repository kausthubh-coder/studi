import { NextRequest } from "next/server";
import {
  connectPtySession,
  ensurePtySession,
} from "@/lib/daytona/server";
import { requireLabSession } from "@/lib/server/lab-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseEvent(event: string, data: string) {
  return `event: ${event}\ndata: ${data}\n\n`;
}

export async function GET(request: NextRequest) {
  const threadId = request.nextUrl.searchParams.get("threadId")?.trim();
  const sessionId =
    request.nextUrl.searchParams.get("sessionId")?.trim() || "studi-main";

  if (!threadId) {
    return new Response("Missing threadId.", { status: 400 });
  }

  const encoder = new TextEncoder();

  try {
    const { session } = await requireLabSession(threadId);
    console.info("[lab-pty-stream] ensure session", {
      threadId,
      sessionId,
      sandboxId: session.sandboxId,
    });
    await ensurePtySession({
      sandboxId: session.sandboxId,
      sessionId,
    });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const close = () => {
          if (closed) {
            return;
          }
          closed = true;
          controller.close();
        };

        let handle: Awaited<ReturnType<typeof connectPtySession>>;
        try {
          handle = await connectPtySession({
            sandboxId: session.sandboxId,
            sessionId,
            onData: async (data) => {
              controller.enqueue(
                encoder.encode(
                  sseEvent(
                    "data",
                    JSON.stringify(new TextDecoder().decode(data)),
                  ),
                ),
              );
            },
          });
        } catch (error) {
          console.error("[lab-pty-stream] connect failed", {
            threadId,
            sessionId,
            sandboxId: session.sandboxId,
            error: error instanceof Error ? error.message : String(error),
          });
          controller.enqueue(
            encoder.encode(
              sseEvent(
                "error",
                JSON.stringify(
                  error instanceof Error
                    ? error.message
                    : "Unable to connect PTY stream.",
                ),
              ),
            ),
          );
          close();
          return;
        }

        const abortListener = () => {
          void handle.disconnect().catch(() => undefined);
          close();
        };
        request.signal.addEventListener("abort", abortListener);

        controller.enqueue(
          encoder.encode(
            sseEvent(
              "ready",
              JSON.stringify({ sessionId: handle.sessionId }),
            ),
          ),
        );

        try {
          const result = await handle.wait();
          controller.enqueue(
            encoder.encode(sseEvent("exit", JSON.stringify(result))),
          );
        } catch (error) {
          console.error("[lab-pty-stream] stream wait failed", {
            threadId,
            sessionId,
            sandboxId: session.sandboxId,
            error: error instanceof Error ? error.message : String(error),
          });
          controller.enqueue(
            encoder.encode(
              sseEvent(
                "error",
                JSON.stringify(
                  error instanceof Error ? error.message : "PTY stream failed.",
                ),
              ),
            ),
          );
        } finally {
          request.signal.removeEventListener("abort", abortListener);
          await handle.disconnect().catch(() => undefined);
          close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[lab-pty-stream] open failed", {
      threadId,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    const errorStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            sseEvent(
              "error",
              JSON.stringify(
                error instanceof Error
                  ? error.message
                  : "Unable to open PTY stream.",
              ),
            ),
          ),
        );
        controller.close();
      },
    });

    return new Response(errorStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }
}
