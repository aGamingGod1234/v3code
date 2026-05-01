import "../index.css";

import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

const { openInPreferredEditorMock, readLocalApiMock, serverGetConfigMock, shellOpenInEditorMock } =
  vi.hoisted(() => ({
    openInPreferredEditorMock: vi.fn(
      async (
        api: { shell: { openInEditor: (path: string, editor: string) => Promise<void> } },
        targetPath: string,
      ) => {
        await api.shell.openInEditor(targetPath, "vscode");
        return "vscode";
      },
    ),
    serverGetConfigMock: vi.fn(async () => ({ availableEditors: ["vscode"] })),
    shellOpenInEditorMock: vi.fn(async () => undefined),
    readLocalApiMock: vi.fn(() => ({
      persistence: {
        getClientSettings: vi.fn(async () => null),
        setClientSettings: vi.fn(async () => undefined),
      },
      server: { getConfig: serverGetConfigMock },
      shell: { openInEditor: shellOpenInEditorMock },
    })),
  }));

vi.mock("../editorPreferences", () => ({
  openInPreferredEditor: openInPreferredEditorMock,
}));

vi.mock("../localApi", () => ({
  ensureLocalApi: vi.fn(() => {
    throw new Error("ensureLocalApi not implemented in browser test");
  }),
  readLocalApi: readLocalApiMock,
}));

import ChatMarkdown from "./ChatMarkdown";

describe("ChatMarkdown", () => {
  afterEach(() => {
    openInPreferredEditorMock.mockClear();
    readLocalApiMock.mockClear();
    serverGetConfigMock.mockClear();
    shellOpenInEditorMock.mockClear();
    localStorage.clear();
    document.body.innerHTML = "";
    Reflect.deleteProperty(window, "nativeApi");
  });

  it("rewrites file uri hrefs into direct paths before rendering", async () => {
    window.nativeApi = readLocalApiMock() as unknown as NonNullable<typeof window.nativeApi>;
    const filePath =
      "/Users/yashsingh/p/sco/claude-code-extract/src/utils/permissions/PermissionRule.ts";
    const screen = await render(
      <ChatMarkdown text={`[PermissionRule.ts](file://${filePath})`} cwd="/repo/project" />,
    );

    try {
      const link = page.getByRole("link", { name: "PermissionRule.ts" });
      await expect.element(link).toBeInTheDocument();
      await expect.element(link).toHaveAttribute("href", filePath);

      await link.click();

      await vi.waitFor(() => {
        expect(shellOpenInEditorMock).toHaveBeenCalledWith(filePath, "vscode");
      });
    } finally {
      await screen.unmount();
    }
  });

  it("keeps line anchors working after rewriting file uri hrefs", async () => {
    window.nativeApi = readLocalApiMock() as unknown as NonNullable<typeof window.nativeApi>;
    const filePath =
      "/Users/yashsingh/p/sco/claude-code-extract/src/utils/permissions/PermissionRule.ts";
    const screen = await render(
      <ChatMarkdown text={`[PermissionRule.ts:1](file://${filePath}#L1)`} cwd="/repo/project" />,
    );

    try {
      const link = page.getByRole("link", { name: "PermissionRule.ts · L1" });
      await expect.element(link).toBeInTheDocument();
      await expect.element(link).toHaveAttribute("href", `${filePath}#L1`);

      await link.click();

      await vi.waitFor(() => {
        expect(shellOpenInEditorMock).toHaveBeenCalledWith(`${filePath}:1`, "vscode");
      });
    } finally {
      await screen.unmount();
    }
  });

  it("shows column information inline when present", async () => {
    window.nativeApi = readLocalApiMock() as unknown as NonNullable<typeof window.nativeApi>;
    const filePath =
      "/Users/yashsingh/p/sco/claude-code-extract/src/utils/permissions/PermissionRule.ts";
    const screen = await render(
      <ChatMarkdown text={`[PermissionRule.ts](file://${filePath}#L1C7)`} cwd="/repo/project" />,
    );

    try {
      const link = page.getByRole("link", { name: "PermissionRule.ts · L1:C7" });
      await expect.element(link).toBeInTheDocument();
      await expect.element(link).toHaveAttribute("href", `${filePath}#L1C7`);

      await link.click();

      await vi.waitFor(() => {
        expect(shellOpenInEditorMock).toHaveBeenCalledWith(`${filePath}:1:7`, "vscode");
      });
    } finally {
      await screen.unmount();
    }
  });

  it("disambiguates duplicate file basenames inline", async () => {
    const firstPath = "/Users/yashsingh/p/t3code/apps/web/src/components/chat/MessagesTimeline.tsx";
    const secondPath = "/Users/yashsingh/p/t3code/apps/web/src/components/MessagesTimeline.tsx";
    const screen = await render(
      <ChatMarkdown
        text={`See [MessagesTimeline.tsx](file://${firstPath}) and [MessagesTimeline.tsx](file://${secondPath}).`}
        cwd="/repo/project"
      />,
    );

    try {
      await expect
        .element(page.getByRole("link", { name: "MessagesTimeline.tsx · components/chat" }))
        .toBeInTheDocument();
      await expect
        .element(page.getByRole("link", { name: "MessagesTimeline.tsx · src/components" }))
        .toBeInTheDocument();
    } finally {
      await screen.unmount();
    }
  });

  it("keeps normal web links unchanged", async () => {
    const screen = await render(
      <ChatMarkdown text="[OpenAI](https://openai.com/docs)" cwd="/repo/project" />,
    );

    try {
      const link = page.getByRole("link", { name: "OpenAI" });
      await expect.element(link).toBeInTheDocument();
      await expect.element(link).toHaveAttribute("href", "https://openai.com/docs");
      await expect.element(link).toHaveAttribute("target", "_blank");
    } finally {
      await screen.unmount();
    }
  });
});
