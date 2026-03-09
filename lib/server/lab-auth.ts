import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export async function requireLabSession(threadId: string) {
  const authState = await auth();
  if (!authState.userId) {
    throw new Error("Unauthorized");
  }

  const token = await authState.getToken({ template: "convex" });
  if (!token) {
    throw new Error("Unauthorized");
  }

  const session = await fetchQuery(
    api.labs.getLabSession,
    { threadId },
    { token },
  );

  if (!session || session.archivedAt) {
    throw new Error("No active lab session for this thread.");
  }

  return {
    session,
    token,
    userId: authState.userId,
  };
}
