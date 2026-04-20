import DOMPurify from "dompurify";

/** Helper: convert plain text (with newlines) to simple HTML for Tiptap.
 *  All output is sanitized with DOMPurify to prevent XSS. */
export function plainTextToHtml(text: string): string {
  if (!text) return "";

  let html: string;
  if (text.trim().startsWith("<")) {
    // Already looks like HTML — sanitize before returning
    html = text;
  } else {
    // Convert newlines to paragraphs
    html = text
      .split(/\n\n+/)
      .map(para => `<p>${para.replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "b",
      "i",
      "em",
      "strong",
      "u",
      "a",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "pre",
      "code",
      "span",
      "div",
      "hr",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class", "style"],
  });
}
