// V3 Phase 10 — preview inspector companion script.
//
// The V3 PreviewPane overlays an `ElementInspector` div on top of the
// iframe and posts `{ type: "v3:preview-inspect:request", coord,
// requestId }` into the iframe whenever the user clicks while the
// inspector is active. This script listens for that message and
// replies with a serialised description of the clicked DOM node.
//
// The previewed app needs to include this file (copy/paste or via a
// `<script src=...>` tag) for rich inspection to work; without it the
// outer UI falls back to the coordinate-only path.

(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const REQUEST_TYPE = "v3:preview-inspect:request";
  const RESPONSE_TYPE = "v3:preview-inspect:response";

  function getElementAt(coord) {
    const el = document.elementFromPoint(coord.x, coord.y);
    return el instanceof Element ? el : null;
  }

  function classListOf(el) {
    try {
      return Array.from(el.classList);
    } catch {
      return [];
    }
  }

  function attributesOf(el) {
    const list = [];
    for (const attr of Array.from(el.attributes)) {
      list.push({ name: attr.name, value: attr.value });
    }
    return list;
  }

  function cssSelectorOf(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    const tag = el.tagName.toLowerCase();
    const classes = classListOf(el)
      .slice(0, 3)
      .map(function (c) {
        return "." + CSS.escape(c);
      })
      .join("");
    const parent = el.parentElement;
    if (!parent) return tag + classes;
    const index = Array.from(parent.children)
      .filter(function (child) {
        return child.tagName === el.tagName;
      })
      .indexOf(el);
    return tag + classes + (index > 0 ? ":nth-of-type(" + (index + 1) + ")" : "");
  }

  function xpathOf(el) {
    if (!el.parentElement) return "/" + el.tagName.toLowerCase();
    let path = "";
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousSibling;
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
          index += 1;
        }
        sibling = sibling.previousSibling;
      }
      path = "/" + current.tagName.toLowerCase() + "[" + index + "]" + path;
      current = current.parentElement;
    }
    return path;
  }

  function serialiseElement(el) {
    const outerHtml = el.outerHTML || null;
    return {
      tagName: el.tagName,
      id: el.id || null,
      classList: classListOf(el),
      attributes: attributesOf(el),
      textContent: typeof el.textContent === "string" ? el.textContent.slice(0, 2000) : null,
      outerHtmlPreview: typeof outerHtml === "string" ? outerHtml.slice(0, 2000) : null,
      cssSelector: cssSelectorOf(el),
      xpath: xpathOf(el),
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };
  }

  window.addEventListener("message", function (event) {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type !== REQUEST_TYPE) return;
    const coord = data.coord;
    if (!coord || typeof coord.x !== "number" || typeof coord.y !== "number") {
      return;
    }
    const el = getElementAt(coord);
    const element = el ? serialiseElement(el) : null;
    const source = event.source;
    if (source && typeof source.postMessage === "function") {
      source.postMessage(
        {
          type: RESPONSE_TYPE,
          requestId: data.requestId || null,
          element: element,
        },
        "*",
      );
    }
  });
})();
