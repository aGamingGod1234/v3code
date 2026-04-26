// V3 Phase 10 — Cursor/Windsurf-style element serialiser.
//
// `ElementInspector` overlays the preview iframe with a crosshair. When
// the user clicks, the overlay posts a message into the iframe asking
// it to serialise the clicked DOM node. The iframe replies with a
// structured `SerializedElement` which we format into agent-context
// markdown.
//
// Keeping the serialisation logic here (pure, no DOM imports) means we
// can unit-test it with plain JS objects and share the formatter
// between the inspector panel and agent-context insertion.

export interface SerializedElement {
  readonly tagName: string;
  readonly id: string | null;
  readonly classList: ReadonlyArray<string>;
  readonly attributes: ReadonlyArray<{ readonly name: string; readonly value: string }>;
  readonly textContent: string | null;
  readonly outerHtmlPreview: string | null;
  readonly cssSelector: string | null;
  readonly xpath: string | null;
  readonly url: string | null;
  readonly viewport: { readonly width: number; readonly height: number } | null;
}

const sanitiseWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

export const formatElementForAgent = (element: SerializedElement): string => {
  const lines: string[] = [];
  const idPart = element.id !== null ? `#${element.id}` : "";
  const classPart =
    element.classList.length > 0
      ? `.${element.classList.slice(0, 3).join(".")}${element.classList.length > 3 ? "…" : ""}`
      : "";
  lines.push(`**Element**: \`<${element.tagName.toLowerCase()}${idPart}${classPart}>\``);
  if (element.cssSelector !== null) {
    lines.push(`**Selector**: \`${element.cssSelector}\``);
  }
  if (element.xpath !== null) {
    lines.push(`**XPath**: \`${element.xpath}\``);
  }
  if (element.url !== null) {
    lines.push(`**URL**: ${element.url}`);
  }
  if (element.viewport !== null) {
    lines.push(`**Viewport**: ${element.viewport.width}×${element.viewport.height}`);
  }
  const text = element.textContent !== null ? sanitiseWhitespace(element.textContent) : "";
  if (text.length > 0) {
    lines.push("", "**Text content**:", "", `> ${truncate(text, 280)}`);
  }
  const meaningfulAttrs = element.attributes.filter(
    (attr) =>
      attr.name !== "class" &&
      attr.name !== "id" &&
      !attr.name.startsWith("aria-describedby") &&
      attr.value.length > 0,
  );
  if (meaningfulAttrs.length > 0) {
    lines.push(
      "",
      "**Attributes**:",
      "",
      ...meaningfulAttrs
        .slice(0, 8)
        .map((attr) => `- \`${attr.name}\` = \`${truncate(sanitiseWhitespace(attr.value), 120)}\``),
    );
  }
  if (element.outerHtmlPreview !== null) {
    lines.push(
      "",
      "**HTML preview**:",
      "",
      "```html",
      truncate(sanitiseWhitespace(element.outerHtmlPreview), 800),
      "```",
    );
  }
  return lines.join("\n");
};

const validTagName = /^[A-Za-z][A-Za-z0-9]*$/;

export const isSerializedElement = (value: unknown): value is SerializedElement => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.tagName !== "string" || !validTagName.test(record.tagName)) return false;
  if (record.id !== null && typeof record.id !== "string") return false;
  if (!Array.isArray(record.classList)) return false;
  if (!record.classList.every((entry) => typeof entry === "string")) return false;
  if (!Array.isArray(record.attributes)) return false;
  if (
    !record.attributes.every(
      (attr) =>
        typeof attr === "object" &&
        attr !== null &&
        typeof (attr as Record<string, unknown>).name === "string" &&
        typeof (attr as Record<string, unknown>).value === "string",
    )
  ) {
    return false;
  }
  return true;
};
