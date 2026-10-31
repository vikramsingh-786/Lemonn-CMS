"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bold,
  CircleCheck,
  CircleDashed,
  CircleX,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Send,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatIst } from "@/features/dashboard/format";
import { SourceLink } from "@/features/dashboard/status";
import { DRAFT_LIMITS } from "@/features/research/draft-limits";
import type { ClaimStatus, DraftCheck } from "@/features/research/types";
import { cn } from "@/lib/utils";
import { prefixLines, wrapSelection, type Edit } from "./editing";
import { ArticleBody } from "./markdown";
import {
  BLOCKING_CHECKS,
  STATUS_LABEL,
  type Article,
  type ArticleContext,
  type ArticleFields,
  type ArticleSaveRequest,
  type ArticleStatus,
} from "./types";

const CHECK_LABEL: Record<DraftCheck["check"], string> = {
  figures: "Every number is in the evidence",
  claim_ids: "Claim ids valid",
  no_copying: "No copied sentences",
  no_advice: "No investment advice",
  lengths: "Field lengths",
};

const CLAIM_LABEL: Record<ClaimStatus, string> = {
  verified: "Verified",
  partially_verified: "Partially verified",
  conflicting_evidence: "Conflicting evidence",
  unverified: "Not verified",
  verification_failed: "Check failed",
};

const FIELD =
  "w-full rounded-xl border border-input bg-card px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Toolbar buttons: each a pure edit of the body text and selection (see editing.ts). */
const TOOLS: {
  label: string;
  icon: typeof Bold;
  edit: (v: string, s: number, e: number) => Edit;
}[] = [
  { label: "Heading", icon: Heading2, edit: (v, s, e) => prefixLines(v, s, e, "## ") },
  { label: "Subheading", icon: Heading3, edit: (v, s, e) => prefixLines(v, s, e, "### ") },
  { label: "Bold", icon: Bold, edit: (v, s, e) => wrapSelection(v, s, e, "**", "bold text") },
  { label: "Italic", icon: Italic, edit: (v, s, e) => wrapSelection(v, s, e, "*", "italic text") },
  { label: "Bullet list", icon: List, edit: (v, s, e) => prefixLines(v, s, e, "- ") },
  { label: "Numbered list", icon: ListOrdered, edit: (v, s, e) => prefixLines(v, s, e, "1. ") },
  { label: "Quote", icon: Quote, edit: (v, s, e) => prefixLines(v, s, e, "> ") },
];

const fieldsOf = (a: ArticleFields): ArticleFields => ({
  headline: a.headline,
  summary: a.summary,
  body: a.body,
  seoTitle: a.seoTitle,
  seoDescription: a.seoDescription,
  category: a.category,
  tags: a.tags,
});

const wordCount = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;
const sentenceCount = (s: string) =>
  s.split(/(?<=[.!?])\s+(?=[A-Z"'“‘])/).filter((x) => x.trim()).length;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/** Full-page editor for one article: text, format, SEO, checks and the story's fact sheet. */
export function ArticleEditor({ initial, context }: { initial: Article; context: ArticleContext }) {
  const [saved, setSaved] = useState(initial);
  const [fields, setFields] = useState<ArticleFields>(() => fieldsOf(initial));
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "conflict"; text: string } | null>(null);
  const [confirmPartial, setConfirmPartial] = useState(false);
  const body = useRef<HTMLTextAreaElement>(null);

  const dirty = useMemo(
    () => JSON.stringify(fields) !== JSON.stringify(fieldsOf(saved)),
    [fields, saved],
  );
  const partial = context.draft.verificationStatus !== "verified";
  const failing = saved.checks.filter((c) => !c.passed && BLOCKING_CHECKS.includes(c.check));
  const set = <K extends keyof ArticleFields>(key: K, value: ArticleFields[K]) =>
    setFields((f) => ({ ...f, [key]: value }));

  const save = useCallback(
    async (status?: ArticleStatus) => {
      setSaving(true);
      setMessage(null);
      try {
        const request: ArticleSaveRequest = {
          ...fields,
          version: saved.version,
          ...(status && { status }),
          ...(status === "ready" && { confirmPartial }),
        };
        const response = await fetch(`/api/articles/${saved.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        const data = (await response.json().catch(() => null)) as
          | (Article & { error?: undefined })
          | { error: { message: string }; article?: Article }
          | null;
        if (!response.ok || !data || data.error) {
          const text = data?.error?.message ?? `Save failed (${response.status}).`;
          setMessage({ kind: response.status === 409 ? "conflict" : "error", text });
          return;
        }
        setSaved(data);
        setFields(fieldsOf(data));
      } catch {
        setMessage({ kind: "error", text: "Could not reach the server. Your text is still here." });
      } finally {
        setSaving(false);
      }
    },
    [fields, saved.id, saved.version, confirmPartial],
  );

  // ⌘S / Ctrl+S saves; leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) void save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [dirty, save, saving]);

  function applyEdit(edit: (value: string, start: number, end: number) => Edit) {
    const el = body.current;
    if (!el) return;
    const next = edit(el.value, el.selectionStart, el.selectionEnd);
    set("body", next.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  }

  const words = wordCount(fields.body);
  const L = DRAFT_LIMITS;

  return (
    <div className="flex flex-col gap-5">
      {/* Action bar: stays in view while scrolling (from tablet width; on phones it would eat the screen). */}
      <div className="surface-raised z-30 flex md:sticky md:top-20 flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-card/95 px-4 py-3 backdrop-blur">
        <Link
          href="/articles"
          className="inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Articles
        </Link>
        <StatusBadge status={saved.status} />
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : `Saved ${formatIst(saved.updatedAt)}`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void save()}
            disabled={saving || !dirty}
          >
            Save
            <kbd className="hidden text-[10px] text-muted-foreground sm:inline">⌘S</kbd>
          </Button>
          {saved.status === "ready" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void save("draft")}
              disabled={saving}
            >
              Back to editing
            </Button>
          ) : saved.status === "rejected" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void save("draft")}
              disabled={saving}
            >
              Restore
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void save("rejected")}
                disabled={saving}
              >
                Reject
              </Button>
              <Button size="sm" onClick={() => void save("ready")} disabled={saving}>
                Mark ready
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled
            title="Publishing to lemonn.co.in is not connected yet"
          >
            <Send aria-hidden />
            Publish
          </Button>
        </div>
      </div>

      {message && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{message.text}</span>
          {message.kind === "conflict" && (
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* Writing column */}
        <section
          aria-label="Article"
          className="surface-raised flex min-w-0 flex-col gap-5 rounded-lg border border-border bg-card p-4 sm:p-6"
        >
          <Field
            label="Headline"
            count={`${fields.headline.length} / ${L.headline}`}
            over={fields.headline.length > L.headline}
          >
            {(id) => (
              <textarea
                id={id}
                rows={2}
                value={fields.headline}
                onChange={(e) => set("headline", e.target.value.replace(/\n/g, " "))}
                className={cn(
                  FIELD,
                  "resize-none font-display text-xl font-semibold tracking-tight sm:text-2xl",
                )}
              />
            )}
          </Field>

          <Field
            label="Summary"
            hint="The standfirst under the headline"
            count={`${sentenceCount(fields.summary)} / ${L.summarySentencesMax} sentences`}
            over={sentenceCount(fields.summary) > L.summarySentencesMax}
          >
            {(id) => (
              <textarea
                id={id}
                rows={3}
                value={fields.summary}
                onChange={(e) => set("summary", e.target.value)}
                className={cn(FIELD, "resize-y")}
              />
            )}
          </Field>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Body</span>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  words < L.bodyWordsMin || words > L.bodyWordsMax
                    ? "text-warning"
                    : "text-muted-foreground",
                )}
              >
                {words} words · aim for {L.bodyWordsMin}–{L.bodyWordsMax}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted p-1">
              <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-0.5">
                {TOOLS.map(({ label, icon: Icon, edit }) => (
                  <button
                    key={label}
                    type="button"
                    title={label}
                    aria-label={label}
                    onClick={() => applyEdit(edit)}
                    disabled={mode === "preview"}
                    className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
                  >
                    <Icon aria-hidden className="size-4" />
                  </button>
                ))}
              </div>
              <div role="group" aria-label="View" className="flex gap-0.5">
                {(["write", "preview"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      mode === m
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {mode === "write" ? (
              <>
                <textarea
                  ref={body}
                  aria-label="Body"
                  rows={20}
                  value={fields.body}
                  onChange={(e) => set("body", e.target.value)}
                  className={cn(FIELD, "min-h-[24rem] resize-y leading-7")}
                />
                <p className="text-xs text-muted-foreground">
                  Blank line between paragraphs · <code>## Heading</code> · <code>- list</code> ·{" "}
                  <code>**bold**</code> · <code>*italic*</code> · <code>&gt; quote</code>
                </p>
              </>
            ) : (
              <article className="rounded-xl border border-border bg-background/40 p-4 sm:p-6">
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  {fields.headline}
                </h1>
                <p className="mt-3 text-base text-muted-foreground">{fields.summary}</p>
                <ArticleBody source={fields.body} className="mt-6" />
              </article>
            )}
          </div>
        </section>

        {/* Side column: checks, SEO, category, fact sheet */}
        <aside className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Checks"
            note={
              dirty
                ? "Showing the last save; unsaved edits are checked when you save."
                : "Re-checked on every save."
            }
          >
            <ul className="space-y-1.5 text-sm">
              {saved.checks.map((c) => (
                <li key={c.check} className="flex items-start gap-2">
                  {c.passed ? (
                    <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : BLOCKING_CHECKS.includes(c.check) ? (
                    <CircleX aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                  ) : (
                    <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                  )}
                  <span className="min-w-0">
                    {CHECK_LABEL[c.check]}
                    {c.note && (
                      <span className="block text-xs text-muted-foreground">{c.note}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {saved.status === "draft" && (
              <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                {failing.length > 0 ? (
                  <p>
                    Fix the failed checks (red) before marking this article ready. Amber ones are
                    advice.
                  </p>
                ) : (
                  <p>No blocking issues. Mark ready once you have read it in full.</p>
                )}
                {partial && (
                  <label className="mt-2 flex items-start gap-2 text-foreground">
                    <input
                      type="checkbox"
                      checked={confirmPartial}
                      onChange={(e) => setConfirmPartial(e.target.checked)}
                      className="mt-0.5 size-4 accent-[var(--primary)]"
                    />
                    <span>I have checked the partially verified claims in the fact sheet.</span>
                  </label>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Search & SEO">
            <div className="flex flex-col gap-3">
              <Field
                label="SEO title"
                count={`${fields.seoTitle.length} / ${L.seoTitle}`}
                over={fields.seoTitle.length > L.seoTitle}
              >
                {(id) => (
                  <input
                    id={id}
                    value={fields.seoTitle}
                    onChange={(e) => set("seoTitle", e.target.value)}
                    className={FIELD}
                  />
                )}
              </Field>
              <Field
                label="SEO description"
                count={`${fields.seoDescription.length} / ${L.seoDescription}`}
                over={fields.seoDescription.length > L.seoDescription}
              >
                {(id) => (
                  <textarea
                    id={id}
                    rows={3}
                    value={fields.seoDescription}
                    onChange={(e) => set("seoDescription", e.target.value)}
                    className={cn(FIELD, "resize-none")}
                  />
                )}
              </Field>
              {/* How the article would look in search results. */}
              <div className="rounded-xl bg-muted p-3">
                <p className="text-[11px] text-muted-foreground">Search preview</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  lemonn.co.in › news › {slug(fields.headline)}
                </p>
                <p className="mt-0.5 line-clamp-2 text-base leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
                  {fields.seoTitle || fields.headline}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {fields.seoDescription}
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Category & tags">
            <div className="flex flex-col gap-3">
              <Field label="Category">
                {(id) => (
                  <select
                    id={id}
                    value={fields.category}
                    onChange={(e) => set("category", e.target.value)}
                    className={FIELD}
                  >
                    {context.categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                )}
              </Field>
              <TagInput
                tags={fields.tags}
                onChange={(tags) => set("tags", tags)}
                min={L.tagsMin}
                max={L.tagsMax}
              />
            </div>
          </Panel>

          <FactSheet context={context} />
        </aside>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ArticleStatus }) {
  return (
    <Badge variant={status === "ready" ? "success" : status === "rejected" ? "neutral" : "warning"}>
      {status === "ready" ? <CircleCheck aria-hidden /> : <CircleDashed aria-hidden />}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="surface-raised rounded-lg border border-border bg-card p-4 sm:p-5"
      aria-label={title}
    >
      <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  count,
  over,
  children,
}: {
  label: string;
  hint?: string;
  count?: string;
  over?: boolean;
  children: (id: string) => React.ReactNode;
}) {
  const id = `field-${slug(label)}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
          {hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>}
        </label>
        {count && (
          <span
            className={cn("text-xs tabular-nums", over ? "text-warning" : "text-muted-foreground")}
          >
            {count}
          </span>
        )}
      </div>
      {children(id)}
    </div>
  );
}

function TagInput({
  tags,
  onChange,
  min,
  max,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  min: number;
  max: number;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim().replace(/,$/, "");
    if (tag && tags.length < 10 && !tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
      onChange([...tags, tag]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor="field-tags" className="text-sm font-medium">
          Tags
        </label>
        <span
          className={cn(
            "text-xs tabular-nums",
            tags.length < min || tags.length > max ? "text-warning" : "text-muted-foreground",
          )}
        >
          {tags.length} · aim for {min}–{max}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-xs"
          >
            {t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        id="field-tags"
        value={draft}
        placeholder="Add a tag and press Enter"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        className={FIELD}
      />
    </div>
  );
}

/** What the article may say: each claim's verification and evidence, and what isn't confirmed. */
function FactSheet({ context }: { context: ArticleContext }) {
  const { draft, story } = context;
  const evidence = new Map(story.evidence.map((e) => [e.id, e]));
  const claims = story.claims.filter((a) => a.materiality !== "low");
  return (
    <Panel
      title="Fact sheet"
      note="Only verified facts may be stated as fact; partially verified ones must be attributed."
    >
      <div className="flex flex-wrap gap-1.5">
        <Badge variant={draft.verificationStatus === "verified" ? "success" : "warning"}>
          {draft.verificationStatus === "verified" ? "Verified story" : "Partially verified story"}
        </Badge>
        <Badge variant="outline">AI draft · {draft.model}</Badge>
      </div>
      <ul className="mt-3 space-y-2">
        {claims.map((a) => {
          const links = a.links
            .filter((l) => l.relation === "supports")
            .map((l) => evidence.get(l.evidenceId))
            .filter((e) => e !== undefined);
          return (
            <li key={a.id} className="rounded-xl bg-muted px-3 py-2.5 text-xs">
              <span
                className={cn(
                  "font-medium",
                  a.status === "verified"
                    ? "text-success"
                    : a.status === "partially_verified"
                      ? "text-warning"
                      : "text-muted-foreground",
                )}
              >
                {CLAIM_LABEL[a.status]}
              </span>
              <p className="mt-0.5 text-foreground">{a.claim}</p>
              {links.map((e) => (
                <p key={e.id} className="mt-1 flex min-w-0 items-baseline gap-1.5">
                  <span
                    className={cn(
                      "shrink-0",
                      e.kind === "primary" ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {e.kind === "primary" ? "Official" : "News"}
                  </span>
                  <SourceLink href={e.url}>{e.title || e.url}</SourceLink>
                </p>
              ))}
            </li>
          );
        })}
      </ul>
      {draft.missingEvidenceWarnings.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-warning">Not confirmed: don’t state as fact</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {draft.missingEvidenceWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 flex min-w-0 items-baseline gap-1.5 text-xs">
        <span className="shrink-0 font-medium">Original · {story.publisher}</span>
        <SourceLink href={story.url}>{story.headline}</SourceLink>
      </p>
    </Panel>
  );
}
