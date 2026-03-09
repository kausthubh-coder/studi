import { NextRequest, NextResponse } from "next/server";
import { sendPtyInput } from "@/lib/daytona/server";
import { requireLabSession } from "@/lib/server/lab-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      threadId?: string;
      sessionId?: string;
      data?: string;
    };

    const threadId = body.threadId?.trim();
    const sessionId = body.sessionId?.trim() || "studi-main";
    if (!threadId || typeof body.data !== "string") {
      return NextResponse.json(
        { error: "Missing threadId or input data." },
        { status: 400 },
      );
    }

    const { session } = await requireLabSession(threadId);
    await sendPtyInput({
      sandboxId: session.sandboxId,
      sessionId,
      data: body.data,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to send PTY input.",
      },
      { status: 500 },
    );
  }
}
