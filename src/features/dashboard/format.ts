const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** e.g. "27 Oct, 06:30 pm IST". Returns "Unknown" for missing/invalid dates. */
export function formatIst(iso: string | null): string {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "Unknown" : `${IST.format(date)} IST`;
}
