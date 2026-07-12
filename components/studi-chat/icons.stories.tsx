import type { ComponentType } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  IconArrow,
  IconBook,
  IconBrain,
  IconChevronDown,
  IconChevronDown2,
  IconChevronRight,
  IconCollapse,
  IconCompose,
  IconExpand,
  IconMic,
  IconMicOff,
  IconPaperclip,
  IconPhoneOff,
  IconPlus,
  IconSettings,
  IconSparkle,
  IconX,
} from "./icons";

type IconComponent = ComponentType<{ className?: string }>;

const ICONS: Array<{ name: string; Icon: IconComponent }> = [
  { name: "Compose", Icon: IconCompose },
  { name: "Paperclip", Icon: IconPaperclip },
  { name: "Arrow", Icon: IconArrow },
  { name: "Chevron down", Icon: IconChevronDown },
  { name: "Book", Icon: IconBook },
  { name: "Close", Icon: IconX },
  { name: "Sparkle", Icon: IconSparkle },
  { name: "Brain", Icon: IconBrain },
  { name: "Expand", Icon: IconExpand },
  { name: "Plus", Icon: IconPlus },
  { name: "Chevron right", Icon: IconChevronRight },
  { name: "Collapse", Icon: IconCollapse },
  { name: "Settings", Icon: IconSettings },
  { name: "Microphone", Icon: IconMic },
  { name: "Microphone off", Icon: IconMicOff },
  { name: "Phone off", Icon: IconPhoneOff },
  { name: "Compact chevron down", Icon: IconChevronDown2 },
];

function IconGallery() {
  return (
    <section
      aria-labelledby="icon-gallery-title"
      className="min-h-screen bg-bg px-6 py-10 text-fg"
    >
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-accent2">
          Studi chat primitives
        </p>
        <h1
          id="icon-gallery-title"
          className="mt-2 text-4xl"
          style={{ fontFamily: "var(--font-dm-serif)" }}
        >
          Icon set
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">
          Compact current-color symbols used across chat, Sparks, settings, and
          voice controls.
        </p>

        <ul
          aria-label="Studi chat icon set"
          className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {ICONS.map(({ name, Icon }) => (
            <li
              key={name}
              data-icon-name={name}
              className="flex items-center gap-3 rounded-2xl border border-border-faint bg-bg-card p-4"
            >
              <span
                aria-hidden="true"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent2-dim text-accent2"
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold">{name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const meta = {
  title: "Studi Chat/Icons",
  component: IconGallery,
  tags: ["ai-generated", "autodocs"],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof IconGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("list", { name: "Studi chat icon set" }),
    ).toBeVisible();
    await expect(canvas.getAllByRole("listitem")).toHaveLength(ICONS.length);
    await expect(canvasElement.querySelectorAll("svg")).toHaveLength(
      ICONS.length,
    );
  },
};
