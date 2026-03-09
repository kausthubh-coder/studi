import { NextRequest, NextResponse } from "next/server";
import { resizePty } from "@/lib/daytona/server";
import { requireLabSession } from "@/lib/server/lab-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      threadId?: string;
      sessionId?: string;
      cols?: number;
      rows?: number;
    };

    const threadId = body.threadId?.trim();
    const sessionId = body.sessionId?.trim() || "studi-main";
    const cols =
      typeof body.cols === "number" ? Math.max(40, Math.floor(body.cols)) : 0;
    const rows =
      typeof body.rows === "number" ? Math.max(10, Math.floor(body.rows)) : 0;

    if (!threadId || cols === 0 || rows === 0) {
      return NextResponse.json(
        { error: "Missing threadId or terminal dimensions." },
        { status: 400 },
      );
    }

    const { session } = await requireLabSession(threadId);
    await resizePty({
      sandboxId: session.sandboxId,
      sessionId,
      cols,
      rows,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to resize PTY.",
      },
      { status: 500 },
    );
  }
}
