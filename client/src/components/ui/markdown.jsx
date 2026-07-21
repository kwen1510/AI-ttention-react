import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { cn } from "@/lib/utils.js";

marked.setOptions({
  gfm: true,
  breaks: true,
});

function decorateTaskLists(html) {
  if (!html) return "";

  if (typeof document === "undefined") {
    return html
      .replace(/<li><input /g, '<li class="ui-markdown-task-item"><input ')
      .replace(/<ul>\s*<li class="ui-markdown-task-item">/g, '<ul class="ui-markdown-task-list"><li class="ui-markdown-task-item">');
  }

  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.body.querySelectorAll("li").forEach((item) => {
    const firstElement = item.firstElementChild;
    if (!(firstElement instanceof HTMLInputElement) || firstElement.type !== "checkbox") {
      return;
    }

    item.classList.add("ui-markdown-task-item");
    item.parentElement?.classList.add("ui-markdown-task-list");
  });

  return doc.body.innerHTML;
}

function sanitizeMarkdownHtml(html) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["checked", "disabled", "type", "class"],
    FORBID_TAGS: ["script", "style"],
  });
}

export function renderMarkdownToHtml(content, { inline = false } = {}) {
  const source = String(content || "").trim();
  if (!source) {
    return "";
  }

  const rendered = inline
    ? marked.parseInline(source)
    : marked.parse(source, { async: false });

  const sanitized = sanitizeMarkdownHtml(String(rendered || ""));
  const withTaskClasses = decorateTaskLists(sanitized);
  return sanitizeMarkdownHtml(withTaskClasses);
}

export function MarkdownContent({ content, className, inline = false }) {
  const html = useMemo(
    () => renderMarkdownToHtml(content, { inline }),
    [content, inline]
  );

  if (!html) {
    return null;
  }

  const Component = inline ? "span" : "div";

  return (
    <Component
      className={cn("ui-markdown", inline && "ui-markdown--inline", className)}
      // DOMPurify is applied before decoration and again immediately before this audited sink.
      // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
