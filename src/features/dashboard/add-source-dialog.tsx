"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { ApiErrorBody, ConfiguredSource } from "@/features/research/types";
import { MAX_SOURCES, normalizeSourceUrl } from "@/features/sources/validation";

type AddSourceDialogProps = {
  open: boolean;
  sourceCount: number;
  onClose: () => void;
  onAdded: (source: ConfiguredSource) => void;
};

export function AddSourceDialog({ open, sourceCount, onClose, onAdded }: AddSourceDialogProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function close() {
    setName("");
    setUrl("");
    setError(null);
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // Client checks mirror the server; the server remains the authority.
    if (sourceCount >= MAX_SOURCES)
      return setError(`You can configure at most ${MAX_SOURCES} sources.`);
    if (name.trim().length < 2) return setError("Enter a name (at least 2 characters).");
    const normalized = normalizeSourceUrl(url);
    if (!normalized.ok) return setError(normalized.error);

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url: normalized.url }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError((body as ApiErrorBody | null)?.error?.message ?? "Could not add the source.");
        return;
      }
      onAdded((body as { source: ConfiguredSource }).source);
      close();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add a discovery source"
      actions={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="add-source-form" disabled={saving}>
            {saving ? "Adding…" : "Add source"}
          </Button>
        </>
      }
    >
      {/* Only mounted while open: browser autofill extensions inject attributes into inputs
          present at page load, which breaks hydration. */}
      {open && (
        <form
          id="add-source-form"
          onSubmit={submit}
          className="mt-2 flex flex-col gap-3"
          noValidate
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="h-9 rounded-md border border-input bg-card px-3 text-sm font-normal focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              placeholder="e.g. The Hindu BusinessLine Markets"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            URL
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="url"
              inputMode="url"
              className="h-9 rounded-md border border-input bg-card px-3 font-mono text-sm font-normal focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              placeholder="https://www.example.com/markets"
            />
          </label>
          <p className="text-xs">
            {sourceCount} of {MAX_SOURCES} sources configured. Only public https sites; the domain
            is used as a search filter.
          </p>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
    </Dialog>
  );
}
