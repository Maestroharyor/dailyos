import sanitizeHtml from "sanitize-html";

/**
 * Rich-text handling for product copy authored in the TipTap editor.
 *
 * Descriptions are merchant-authored, but they are rendered verbatim on a
 * public storefront (VKT Bougie interpolates them with `{@html}`), so the HTML
 * is sanitised on write here as well as on render there. The allow-list is
 * deliberately narrower than what a browser accepts: it covers exactly what
 * the editor toolbar can produce, plus the tags a paste from Word or a web
 * page commonly drags in.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "a",
  ],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  transformTags: {
    // A product description must not outrank the page's own <h1>.
    h1: "h2",
    h4: "h3",
    h5: "h3",
    h6: "h3",
    b: "strong",
    i: "em",
    // Merchant links point off-site; never hand them the opener window.
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    }),
  },
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/** True when the value carries no visible content, TipTap emits `<p></p>` for an empty document. */
export function isRichTextEmpty(html: string): boolean {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).trim().length === 0;
}

/**
 * Only a tag we actually recognise counts as "this is already HTML". A loose
 * `/<[a-z]/` test misreads plain copy like `Fits a 13" laptop <just>` as markup,
 * skips escaping, and the sanitiser then deletes the word as an unknown tag.
 * Dangerous tags are listed too, deliberately: content carrying one must reach
 * the sanitiser to be stripped, rather than be escaped into visible text.
 */
const HTML_TAG =
  /<\/?(p|br|strong|b|em|i|u|s|h[1-6]|ul|ol|li|blockquote|code|pre|a|div|span|table|tbody|tr|td|th|img|figure|script|style|iframe|object|embed|svg|form|input)\b[^>]*>/i;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Coerce a stored description into HTML the editor and the storefront can both
 * render. Values written before the rich-text editor existed are plain text
 * whose only structure is newlines; feeding those to TipTap verbatim collapses
 * them into a single run-on paragraph, so they are converted first. Anything
 * that already contains a tag is passed through for `sanitizeRichText` to vet.
 */
export function toRichTextHtml(value: string | null | undefined): string {
  if (!value) return "";
  if (HTML_TAG.test(value)) return value;
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}
