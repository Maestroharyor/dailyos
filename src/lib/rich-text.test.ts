import { describe, it, expect } from "vitest";
import { sanitizeRichText, isRichTextEmpty, toRichTextHtml } from "./rich-text";

describe("sanitizeRichText", () => {
  it("strips script tags", () => {
    expect(sanitizeRichText("<p>Hi</p><script>alert(1)</script>")).toBe("<p>Hi</p>");
  });

  it("strips event-handler attributes", () => {
    expect(sanitizeRichText('<p onclick="steal()">Hi</p>')).toBe("<p>Hi</p>");
  });

  it("drops javascript: links but keeps the text", () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
    expect(out).toContain("click");
  });

  it("forces rel and target on outbound links", () => {
    const out = sanitizeRichText('<a href="https://example.com">shop</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });

  it("demotes h1 so description copy cannot outrank the page heading", () => {
    expect(sanitizeRichText("<h1>Care</h1>")).toBe("<h2>Care</h2>");
  });

  it("keeps the tags the editor toolbar produces", () => {
    const input = "<h2>Design</h2><ul><li><strong>Gold</strong> hardware</li></ul>";
    expect(sanitizeRichText(input)).toBe(input);
  });
});

describe("isRichTextEmpty", () => {
  it("treats TipTap's empty document as empty", () => {
    expect(isRichTextEmpty("<p></p>")).toBe(true);
  });

  it("treats markup with no text as empty", () => {
    expect(isRichTextEmpty("<p><br /></p>")).toBe(true);
  });

  it("is false once there is visible text", () => {
    expect(isRichTextEmpty("<p>Structured tote</p>")).toBe(false);
  });
});

describe("toRichTextHtml", () => {
  it("converts legacy plain text into paragraphs", () => {
    expect(toRichTextHtml("First block.\n\nSecond block.")).toBe(
      "<p>First block.</p><p>Second block.</p>",
    );
  });

  it("keeps single newlines inside a paragraph as line breaks", () => {
    expect(toRichTextHtml("Size: Large\nColours: Black")).toBe(
      "<p>Size: Large<br />Colours: Black</p>",
    );
  });

  it("escapes angle brackets rather than mistaking them for markup", () => {
    expect(toRichTextHtml('Fits a 13" laptop <just>')).toBe(
      '<p>Fits a 13" laptop &lt;just&gt;</p>',
    );
  });

  it("passes existing markup through untouched for the sanitiser to vet", () => {
    expect(toRichTextHtml("<h2>Design</h2>")).toBe("<h2>Design</h2>");
  });

  it("routes dangerous tags to the sanitiser instead of escaping them", () => {
    expect(sanitizeRichText(toRichTextHtml("<script>alert(1)</script>"))).toBe("");
  });

  it("returns an empty string for nullish input", () => {
    expect(toRichTextHtml(null)).toBe("");
    expect(toRichTextHtml(undefined)).toBe("");
  });
});
