import "server-only";
import { nameTokens } from "./extract";

/** Regulators, exchanges and governments whose official domain is fixed (aliases lower-case). */
const KNOWN: readonly [string, readonly string[]][] = [
  ["sebi.gov.in", ["sebi", "securities and exchange board of india"]],
  ["rbi.org.in", ["rbi", "reserve bank of india", "reserve bank"]],
  ["nseindia.com", ["nse", "national stock exchange", "national stock exchange of india"]],
  ["bseindia.com", ["bse", "bombay stock exchange", "bse ltd", "bse limited"]],
  ["pib.gov.in", ["pib", "press information bureau"]],
  ["mca.gov.in", ["mca", "ministry of corporate affairs"]],
  ["finmin.gov.in", ["ministry of finance", "finance ministry", "finmin"]],
  ["amfiindia.com", ["amfi", "association of mutual funds in india"]],
  ["irdai.gov.in", ["irdai", "irda", "insurance regulatory and development authority of india"]],
  ["pfrda.org.in", ["pfrda", "pension fund regulatory and development authority"]],
  ["cci.gov.in", ["cci", "competition commission of india"]],
  ["ifsca.gov.in", ["ifsca", "international financial services centres authority"]],
  [
    "mospi.gov.in",
    [
      "mospi",
      "ministry of statistics and programme implementation",
      "nso",
      "national statistics office",
    ],
  ],
  ["mcxindia.com", ["mcx", "multi commodity exchange", "multi commodity exchange of india"]],
  ["sci.gov.in", ["supreme court", "supreme court of india"]],
  ["nclt.gov.in", ["nclt", "national company law tribunal"]],
  ["nclat.nic.in", ["nclat", "national company law appellate tribunal"]],
  [
    "federalreserve.gov",
    [
      "federal reserve",
      "us federal reserve",
      "us fed",
      "fed",
      "fomc",
      "federal open market committee",
      "federal reserve board",
    ],
  ],
  [
    "sec.gov",
    [
      "us sec",
      "sec",
      "securities and exchange commission",
      "us securities and exchange commission",
    ],
  ],
  ["bls.gov", ["us bls", "bls", "bureau of labor statistics", "us bureau of labor statistics"]],
];

const KNOWN_BY_ALIAS = new Map(
  KNOWN.flatMap(([domain, aliases]) => aliases.map((a) => [a, domain])),
);

/** Never an organisation's own site: publishers, social, directories, brokers. */
const NOT_OFFICIAL = new Set([
  "wikipedia.org",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "crunchbase.com",
  "zaubacorp.com",
  "tofler.in",
  "moneycontrol.com",
  "economictimes.com",
  "indiatimes.com",
  "livemint.com",
  "business-standard.com",
  "reuters.com",
  "bloomberg.com",
  "groww.in",
  "zerodha.com",
  "screener.in",
  "cnbctv18.com",
  "financialexpress.com",
  "ndtv.com",
  "ndtvprofit.com",
  "thehindu.com",
  "hindustantimes.com",
  "businesstoday.in",
  "tickertape.in",
  "trendlyne.com",
  "marketscreener.com",
  "glassdoor.com",
  "ambitionbox.com",
  "justdial.com",
  "indiamart.com",
  "google.com",
  "bing.com",
  "medium.com",
  "reddit.com",
]);

const LOOKALIKE = /-(?:news|update|updates|official|stock|stocks|ipo|fans|share|shares|price)\b/;

/** Two-label public suffixes we see for Indian and common foreign organisations. */
const MULTI_SUFFIXES = new Set([
  "gov.in",
  "nic.in",
  "co.in",
  "org.in",
  "net.in",
  "ac.in",
  "edu.in",
  "res.in",
  "firm.in",
  "bank.in", // RBI moved Indian banks to <name>.bank.in
  "fin.in",
  "co.uk",
  "org.uk",
  "gov.uk",
  "com.au",
  "co.jp",
  "com.sg",
  "com.hk",
  "co.nz",
]);

/** ir.tesla.com → tesla.com; www.sebi.gov.in → sebi.gov.in. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  const lastTwo = labels.slice(-2).join(".");
  return labels.slice(MULTI_SUFFIXES.has(lastTwo) ? -3 : -2).join(".");
}

function label(domain: string): string {
  return domain.split(".")[0]!;
}

/**
 * Labels that count as a name match: joined tokens, first token, first two tokens, initials, the
 * full name with its legal suffix ("vedantalimited"), each ± "india". Whole labels only.
 */
function nameLabels(name: string): Set<string> {
  const tokens = nameTokens(name);
  const all = name.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const bases = [
    tokens.join(""),
    tokens[0] ?? "",
    tokens.slice(0, 2).join(""), // "Adani Ports and SEZ" → adaniports
    tokens.map((t) => t[0]).join(""),
    all.map((t) => t[0]).join(""), // "Reliance Industries Limited" → ril
    all.filter((t) => t !== "the" && t !== "and" && t !== "of").join(""), // vedantalimited
  ].filter((b) => b.length >= 2);
  return new Set(bases.flatMap((b) => [b, `${b}india`]));
}

export type DomainCheck = {
  entity: string;
  domain: string | null;
  status: "validated" | "rejected" | "not_found";
  reason: string;
};

/** Known regulators/exchanges/governments; null when the authority isn't in the map. */
export function knownAuthorityDomain(authority: string): string | null {
  return (
    KNOWN_BY_ALIAS.get(
      authority
        .toLowerCase()
        .replace(/[^\p{L}\p{N}& ]/gu, "")
        .trim(),
    ) ?? null
  );
}

const SEARCH_DEPTH = 10;

/**
 * Picks the official domain from independent search hosts (top 10). The model's hint counts only
 * when the search also ranks it. No prefix matching: "acmeparts" is not "Acme Motors".
 */
export function chooseOfficialDomain(
  authority: string,
  searchHosts: readonly string[],
  hint: string,
): DomainCheck {
  const names = nameLabels(authority);
  const hintDomain = hint ? registrableDomain(hint.replace(/^https?:\/\//, "").split("/")[0]!) : "";
  const rejected: string[] = [];
  for (const host of searchHosts.slice(0, SEARCH_DEPTH)) {
    const domain = registrableDomain(host);
    if (NOT_OFFICIAL.has(domain) || LOOKALIKE.test(label(domain))) {
      rejected.push(domain);
      continue;
    }
    if (names.has(label(domain))) {
      return {
        entity: authority,
        domain,
        status: "validated",
        reason: "Domain name matches the organisation",
      };
    }
    if (hintDomain && domain === hintDomain) {
      return {
        entity: authority,
        domain,
        status: "validated",
        reason: "Model hint confirmed by independent search",
      };
    }
    rejected.push(domain);
  }
  return searchHosts.length === 0
    ? {
        entity: authority,
        domain: null,
        status: "not_found",
        reason: "Search returned no websites",
      }
    : {
        entity: authority,
        domain: null,
        status: "rejected",
        reason: `No search result matched the organisation (${[...new Set(rejected)].slice(0, 3).join(", ")})`,
      };
}

// ponytail: in-memory 24h cache of validated domains, lost on restart; move to the DB later.
const cache = ((
  globalThis as { __officialDomains?: Map<string, { check: DomainCheck; until: number }> }
).__officialDomains ??= new Map());

const cacheKey = (authority: string) => authority.toLowerCase().trim();

function remember(check: DomainCheck) {
  if (check.status === "validated")
    cache.set(cacheKey(check.entity), { check, until: Date.now() + 24 * 3_600_000 });
}

/** Known map or a still-valid cached result; null when a lookup is needed. */
export function cachedOfficialDomain(authority: string): DomainCheck | null {
  const known = knownAuthorityDomain(authority);
  if (known)
    return {
      entity: authority,
      domain: known,
      status: "validated",
      reason: "Known official domain",
    };
  const cached = cache.get(cacheKey(authority));
  return cached && cached.until > Date.now() ? cached.check : null;
}

/** Hosts that appear on filing letterheads but are not the filer's own site. */
const NOT_FILER_SITE = new Set([
  "bseindia.com",
  "nseindia.com",
  "sebi.gov.in",
  "mca.gov.in",
  "kfintech.com",
  "linkintime.co.in",
  "in.mpms.mufg.com",
  "mufg.com",
  "cdslindia.com",
  "nsdl.co.in",
  "nsdl.com",
  "gmail.com",
  "evoting.nsdl.com",
]);

/**
 * The website a listed company declares on its own exchange filing ("Website: www.x.com").
 * The filing must name the company; registrars, exchanges and e-voting hosts are ignored.
 */
export function domainFromFiling(
  text: string,
  authority: string,
  namesCompany: boolean,
): DomainCheck | null {
  if (!namesCompany) return null;
  for (const m of text.matchAll(
    /\b(?:website|web\s?site|web|url)\s*[:\-–]?\s*(?:https?:\/\/)?((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi,
  )) {
    const domain = registrableDomain(m[1]!.replace(/[.,;]+$/, ""));
    if (!domain.includes(".") || NOT_FILER_SITE.has(domain) || NOT_OFFICIAL.has(domain)) continue;
    if (LOOKALIKE.test(label(domain))) continue;
    const check: DomainCheck = {
      entity: authority,
      domain,
      status: "validated",
      reason: "Declared by the company in its own exchange filing",
    };
    remember(check);
    return check;
  }
  return null;
}

/** Search-based lookup (after known map, cache and filings): top-10 hosts + name/hint rules. */
export async function searchOfficialDomain(
  authority: string,
  hint: string,
  search: (query: string) => Promise<string[]>,
): Promise<DomainCheck> {
  const hosts = await search(`${authority} official website`);
  const check = chooseOfficialDomain(authority, hosts, hint);
  remember(check);
  return check;
}
