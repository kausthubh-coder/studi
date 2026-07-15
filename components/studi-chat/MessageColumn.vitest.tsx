import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { MessageColumn } from "@/components/studi-chat/MessageColumn";

const resizeCallbacks: ResizeObserverCallback[] = [];

vi.mock("@/components/studi-chat/MessageRenderer", () => ({
  ArticleMessage: ({ index }: { index: number }) => (
    <article data-testid={`message-${index}`}>Message {index}</article>
  ),
}));

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("MessageColumn latest-turn visibility", () => {
  beforeEach(() => {
    resizeCallbacks.length = 0;
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("follows streaming height changes only while the learner is near the bottom", () => {
    const listRef = createRef<HTMLDivElement>();
    const { rerender } = render(
      <MessageColumn
        listRef={listRef}
        selectedThreadId="thread_1"
        messages={[]}
        onExpandSpark={vi.fn()}
        expandedSparkInstanceId={null}
      />,
    );

    const scroller = listRef.current!;
    let scrollHeight = 1_000;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, get: () => 200 },
      scrollHeight: { configurable: true, get: () => scrollHeight },
    });

    expect(resizeCallbacks).toHaveLength(1);

    scroller.scrollTop = 100;
    fireEvent.scroll(scroller);
    scrollHeight = 1_200;
    resizeCallbacks[0]([], {} as ResizeObserver);
    expect(scroller.scrollTop).toBe(100);

    scroller.scrollTop = 904;
    fireEvent.scroll(scroller);
    scrollHeight = 1_400;
    resizeCallbacks[0]([], {} as ResizeObserver);
    expect(scroller.scrollTop).toBe(1_400);

    rerender(
      <MessageColumn
        listRef={listRef}
        selectedThreadId="thread_2"
        messages={[]}
        onExpandSpark={vi.fn()}
        expandedSparkInstanceId={null}
      />,
    );
    expect(scroller.scrollTop).toBe(1_400);
  });

  it("resumes following when the learner sends a new message", () => {
    const listRef = createRef<HTMLDivElement>();
    const { rerender } = render(
      <MessageColumn
        listRef={listRef}
        selectedThreadId="thread_1"
        messages={[]}
        onExpandSpark={vi.fn()}
        expandedSparkInstanceId={null}
      />,
    );

    const scroller = listRef.current!;
    let scrollHeight = 1_000;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, get: () => 200 },
      scrollHeight: { configurable: true, get: () => scrollHeight },
    });
    scroller.scrollTop = 100;
    fireEvent.scroll(scroller);

    scrollHeight = 1_200;
    rerender(
      <MessageColumn
        listRef={listRef}
        selectedThreadId="thread_1"
        messages={[
          { key: "user-1", role: "user", parts: [] } as never,
        ]}
        onExpandSpark={vi.fn()}
        expandedSparkInstanceId={null}
      />,
    );

    expect(scroller.scrollTop).toBe(1_200);
    resizeCallbacks[0]([], {} as ResizeObserver);
    expect(scroller.scrollTop).toBe(1_200);
  });
});
