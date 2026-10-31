import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The article body format: a small Markdown subset, rendered as React elements (never raw HTML,
 * so text from the AI or an editor can't inject markup).
 *   paragraphs (blank line between) · "## " / "### " headings · "- " bullet and "1. " numbered
 *   lists · "> " quotes · **bold** · *italic*
 */
export type Block =
  { type: "h2" | "h3" | "p" | "quote"; text: string } | { type: "ul" | "ol"; items: string[] };

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of source.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const first = lines[0]!;
    if (lines.length === 1 && first.startsWith("### "))
      blocks.push({ type: "h3", text: first.slice(4) });
    else if (lines.length === 1 && first.startsWith("## "))
      blocks.push({ type: "h2", text: first.slice(3) });
    else if (lines.every((l) => /^[-*] /.test(l)))
      blocks.push({ type: "ul", items: lines.map((l) => l.slice(2)) });
    else if (lines.every((l) => /^\d+[.)] /.test(l)))
      blocks.push({ type: "ol", items: lines.map((l) => l.replace(/^\d+[.)] /, "")) });
    else if (lines.every((l) => l.startsWith(">")))
      blocks.push({ type: "quote", text: lines.map((l) => l.replace(/^>\s?/, "")).join(" ") });
    else blocks.push({ type: "p", text: lines.join(" ") });
  }
  return blocks;
}

/** **bold** and *italic* inside a line; everything else is plain text. */
export function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** The formatted article body, as readers would see it. */
export function ArticleBody({ source, className }: { source: string; className?: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className={cn("space-y-4 text-[15px] leading-7", className)}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h2":
            return (
              <h2 key={i} className="pt-2 font-display text-xl font-semibold tracking-tight">
                {inline(b.text)}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="pt-1 text-base font-semibold">
                {inline(b.text)}
              </h3>
            );
          case "ul":
          case "ol": {
            const List = b.type;
            return (
              <List
                key={i}
                className={cn("space-y-1 pl-6", b.type === "ul" ? "list-disc" : "list-decimal")}
              >
                {b.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </List>
            );
          }
          case "quote":
            return (
              <blockquote
                key={i}
                className="border-l-2 border-primary pl-4 text-muted-foreground italic"
              >
                {inline(b.text)}
              </blockquote>
            );
          default:
            return <p key={i}>{inline(b.text)}</p>;
        }
      })}
    </div>
  );
}
