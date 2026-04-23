import { describe, expect, it } from "vitest";

import {
  formatElementForAgent,
  isSerializedElement,
  type SerializedElement,
} from "./elementSerialization.ts";

const sample: SerializedElement = {
  tagName: "Button",
  id: "save",
  classList: ["btn", "btn-primary", "px-4"],
  attributes: [
    { name: "type", value: "submit" },
    { name: "data-test", value: "save-button" },
    { name: "class", value: "btn btn-primary px-4" },
  ],
  textContent: "Save changes",
  outerHtmlPreview: `<button id="save" class="btn btn-primary px-4">Save changes</button>`,
  cssSelector: "#save",
  xpath: "/html/body/main/button",
  url: "http://localhost:3000/settings",
  viewport: { width: 1280, height: 720 },
};

describe("formatElementForAgent", () => {
  it("renders the primary element header", () => {
    const markdown = formatElementForAgent(sample);
    expect(markdown).toContain("`<button#save.btn.btn-primary.px-4>`");
  });

  it("includes selector + xpath + url + viewport", () => {
    const markdown = formatElementForAgent(sample);
    expect(markdown).toContain("**Selector**: `#save`");
    expect(markdown).toContain("**XPath**: `/html/body/main/button`");
    expect(markdown).toContain("**URL**: http://localhost:3000/settings");
    expect(markdown).toContain("**Viewport**: 1280×720");
  });

  it("omits class/id from meaningful attributes and caps at 8 entries", () => {
    const element: SerializedElement = {
      ...sample,
      attributes: [
        ...Array.from({ length: 20 }, (_, i) => ({
          name: `data-attr-${i}`,
          value: `value-${i}`,
        })),
        { name: "id", value: "save" },
        { name: "class", value: "btn" },
      ],
    };
    const markdown = formatElementForAgent(element);
    const attrLines = markdown.split("\n").filter((line) => line.startsWith("- `"));
    expect(attrLines).toHaveLength(8);
    expect(attrLines.some((line) => line.includes("class"))).toBe(false);
  });

  it("truncates long text content", () => {
    const element: SerializedElement = {
      ...sample,
      textContent: "a".repeat(500),
    };
    const markdown = formatElementForAgent(element);
    expect(markdown).toContain(`> ${"a".repeat(279)}…`);
  });
});

describe("isSerializedElement", () => {
  it("accepts the shape returned by the serialiser", () => {
    expect(isSerializedElement(sample)).toBe(true);
  });

  it("rejects unknown payloads", () => {
    expect(isSerializedElement(null)).toBe(false);
    expect(isSerializedElement({ tagName: 123 })).toBe(false);
    expect(isSerializedElement({ tagName: "div", classList: [1, 2] })).toBe(false);
    expect(
      isSerializedElement({
        tagName: "span",
        id: null,
        classList: [],
        attributes: [{ name: "foo" }],
      }),
    ).toBe(false);
  });
});
