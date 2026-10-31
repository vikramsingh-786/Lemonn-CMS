/** Toolbar edits on a textarea's value: pure functions, so they're easy to test. */
export type Edit = { value: string; selectionStart: number; selectionEnd: number };

/** Wraps the selection in `mark` (e.g. "**"), or inserts `mark` + placeholder + `mark`. */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  mark: string,
  placeholder: string,
): Edit {
  const selected = value.slice(start, end) || placeholder;
  const next = value.slice(0, start) + mark + selected + mark + value.slice(end);
  return {
    value: next,
    selectionStart: start + mark.length,
    selectionEnd: start + mark.length + selected.length,
  };
}

/**
 * Turns the selected lines (or the current line) into a heading, list or quote. Lines that already
 * have the prefix lose it again, so the button toggles. Numbered lists count 1., 2., 3.
 */
export function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: "## " | "### " | "- " | "1. " | "> ",
): Edit {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const marker =
    prefix === "1. "
      ? /^\d+[.)] /
      : new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const strip = (l: string) => l.replace(/^(?:#{2,3} |[-*] |\d+[.)] |> )/, "");
  const all = lines.every((l) => marker.test(l));
  const updated = lines
    .map((l, i) => (all ? strip(l) : `${prefix === "1. " ? `${i + 1}. ` : prefix}${strip(l)}`))
    .join("\n");
  return {
    value: value.slice(0, lineStart) + updated + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + updated.length,
  };
}
