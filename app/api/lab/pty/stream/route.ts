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

  try {
    const { session } = await requireLabSession(threadId);
    await ensurePtySession({
      sandboxId: session.sandboxId,
      sessionId,
    });

    const encoder = new TextEncoder();
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

        const handle = await connectPtySession({
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
    return new Response(
      error instanceof Error ? error.message : "Unable to open PTY stream.",
      { status: 401 },
    );
  }
}
