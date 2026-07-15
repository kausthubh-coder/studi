import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import type { UIMessage } from "@convex-dev/agent/react";
import { ArticleMessage } from "@/components/studi-chat/MessageRenderer";
import type { SparkArtifact } from "@/lib/sparks/contracts";

export function MessageColumn({
  listRef,
  selectedThreadId,
  messages,
  onExpandSpark,
  expandedSparkInstanceId,
}: {
  listRef: RefObject<HTMLDivElement | null>;
  selectedThreadId: string | null;
  messages: UIMessage[];
  onExpandSpark: (
    artifact: SparkArtifact,
    threadId: string | null,
    sparkInstanceId: string,
  ) => void;
  expandedSparkInstanceId: string | null;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldFollowLatestRef = useRef(true);
  const latestMessageKeyRef = useRef<string | null>(null);

  const scrollToLatest = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [listRef]);

  const updateFollowPreference = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const distanceFromBottom =
      list.scrollHeight - list.clientHeight - list.scrollTop;
    shouldFollowLatestRef.current = distanceFromBottom <= 120;
  }, [listRef]);

  useLayoutEffect(() => {
    shouldFollowLatestRef.current = true;
    scrollToLatest();
  }, [selectedThreadId, scrollToLatest]);

  useLayoutEffect(() => {
    const latestMessage = messages.at(-1);
    const latestMessageKey = latestMessage?.key ?? null;
    const learnerJustSent =
      latestMessage?.role === "user" &&
      latestMessageKey !== latestMessageKeyRef.current;
    latestMessageKeyRef.current = latestMessageKey;

    if (learnerJustSent) {
      shouldFollowLatestRef.current = true;
    }
    if (shouldFollowLatestRef.current) {
      scrollToLatest();
    }
  }, [messages, scrollToLatest]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (shouldFollowLatestRef.current) {
        scrollToLatest();
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToLatest]);

  return (
    <div
      ref={listRef}
      data-testid="message-scroll"
      className="flex-1 overflow-y-auto"
      role="region"
      tabIndex={0}
      aria-label="Conversation messages"
      onScroll={updateFollowPreference}
    >
      <div
        ref={contentRef}
        className="mx-auto px-8 pb-8 pt-14"
        style={{ maxWidth: "var(--column-max)" }}
      >
        {selectedThreadId && messages.length === 0 ? (
          <div className="py-24 text-center">
            <p className="font-heading text-base italic text-fg-faint">
              Start by asking a question below.
            </p>
          </div>
        ) : null}

        {messages.map((message, index) => (
          <ArticleMessage
            key={message.key}
            message={message}
            index={index}
            threadId={selectedThreadId}
            onExpandSpark={onExpandSpark}
            expandedSparkInstanceId={expandedSparkInstanceId}
          />
        ))}
      </div>
    </div>
  );
}
