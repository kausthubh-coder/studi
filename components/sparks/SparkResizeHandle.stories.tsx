import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { SparkResizeHandle } from "./SparkResizeHandle";

function ResizeHandleStory() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(420);

  return (
    <div
      ref={containerRef}
      className="flex h-72 w-[900px] max-w-full overflow-hidden rounded-2xl border-2 border-fg bg-bg"
    >
      <section
        className="grid place-items-center bg-bg-card font-ui text-fg"
        style={{ width }}
      >
        Chat · {width}px
      </section>
      <SparkResizeHandle
        containerRef={containerRef}
        width={width}
        onWidthChange={setWidth}
        minChatWidth={260}
        minSparkWidth={260}
      />
      <section className="grid flex-1 place-items-center bg-accent2-dim font-ui text-fg">
        Spark
      </section>
    </div>
  );
}

const meta = {
  title: "Sparks/Resize Handle",
  component: ResizeHandleStory,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ResizeHandleStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const KeyboardResize: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const separator = canvas.getByRole("separator", {
      name: "Resize chat and Spark panels",
    });
    const initial = Number(separator.getAttribute("aria-valuenow"));
    await waitFor(() => {
      expect(Number(separator.getAttribute("aria-valuemax"))).toBeGreaterThan(
        initial,
      );
    });
    separator.focus();
    await expect(separator).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() =>
      expect(separator).toHaveAttribute(
        "aria-valuenow",
        String(initial + 24),
      ),
    );
    await expect(canvas.getByText(`Chat · ${initial + 24}px`)).toBeVisible();
  },
};
