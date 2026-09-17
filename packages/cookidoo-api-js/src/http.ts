/**
 * Minimal cookie-jar + redirect-following fetch wrapper.
 *
 * The OAuth2 login flow bounces across the CIAM host with `Set-Cookie`
 * responses that later requests in the same flow depend on (mirroring the
 * Python client's `aiohttp.CookieJar(unsafe=True)` session). Node's global
 * `fetch` (undici) has no cookie jar of its own, so this module provides a
 * small one scoped to a single `Cookidoo` instance.
 */

export type FetchLike = typeof fetch;

interface StoredCookie {
  value: string;
  domain: string;
}

/**
 * An "unsafe" cookie jar: cookies are matched by domain-suffix against the
 * request host without checking `Secure`/scheme, same as
 * `aiohttp.CookieJar(unsafe=True)`, since the whole login flow runs over
 * HTTPS on a small, trusted set of hosts anyway.
 */
export class CookieJar {
  private readonly cookies = new Map<string, StoredCookie>();

  private static parseSetCookie(setCookie: string): {
    name: string;
    value: string;
    domain: string | null;
  } | null {
    const [pair, ...attrs] = setCookie.split(";");
    const eq = pair?.indexOf("=") ?? -1;
    if (!pair || eq < 0) return null;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) return null;
    let domain: string | null = null;
    for (const attr of attrs) {
      const [k, v] = attr.split("=").map((s) => s.trim());
      if (k?.toLowerCase() === "domain" && v) domain = v.replace(/^\./, "");
    }
    return { name, value, domain };
  }

  /** Store the cookies set by a response for `requestUrl`. */
  storeFromHeaders(requestUrl: string | URL, headers: Headers): void {
    const host = new URL(requestUrl).hostname;
    const setCookies =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : (headers.get("set-cookie")?.split(/,(?=[^;]+?=)/) ?? []);
    for (const raw of setCookies) {
      const parsed = CookieJar.parseSetCookie(raw);
      if (!parsed) continue;
      this.cookies.set(parsed.name, {
        value: parsed.value,
        domain: parsed.domain ?? host,
      });
    }
  }

  /** Build the `Cookie` header value applicable to `targetUrl`. */
  header(targetUrl: string | URL): string | null {
    const host = new URL(targetUrl).hostname;
    const applicable = [...this.cookies.entries()].filter(([, cookie]) =>
      host === cookie.domain || host.endsWith(`.${cookie.domain}`),
    );
    if (applicable.length === 0) return null;
    return applicable.map(([name, cookie]) => `${name}=${cookie.value}`).join("; ");
  }

  clear(): void {
    this.cookies.clear();
  }
}

export interface HttpResponse {
  status: number;
  headers: Headers;
  url: string;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Issue a single HTTP request through the jar, optionally following
 * redirects.
 *
 * A 303 (or a 301/302 on a non-GET request, matching common browser/HTTP
 * client behaviour) switches the follow-up request to a body-less GET; a 307
 * or 308 repeats the original method and body.
 */
export async function jarRequest(
  jar: CookieJar,
  method: string,
  url: string | URL,
  options: {
    headers?: Record<string, string>;
    body?: URLSearchParams | string;
    allowRedirects?: boolean;
    maxRedirects?: number;
    fetchImpl?: FetchLike;
  } = {},
): Promise<HttpResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const allowRedirects = options.allowRedirects ?? true;
  const maxRedirects = options.maxRedirects ?? 10;

  let currentUrl = new URL(url);
  let currentMethod = method;
  let currentBody = options.body;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const cookieHeader = jar.header(currentUrl);
    const headers: Record<string, string> = { ...options.headers };
    if (cookieHeader) headers["Cookie"] = cookieHeader;

    const init: RequestInit = { method: currentMethod, headers, redirect: "manual" };
    if (currentBody !== undefined) init.body = currentBody;
    const response = await fetchImpl(currentUrl, init);
    jar.storeFromHeaders(currentUrl, response.headers);

    const isRedirect = REDIRECT_STATUSES.has(response.status);
    const location = response.headers.get("location");
    if (!allowRedirects || !isRedirect || !location) {
      const finalUrl = currentUrl.toString();
      return {
        status: response.status,
        headers: response.headers,
        url: finalUrl,
        text: () => response.text(),
        json: () => response.json(),
      };
    }

    const nextUrl = new URL(location, currentUrl);
    if (response.status === 303 || (response.status !== 307 && response.status !== 308 && currentMethod !== "GET")) {
      currentMethod = "GET";
      currentBody = undefined;
    }
    currentUrl = nextUrl;
  }

  throw new Error(`Too many redirects while requesting ${String(url)}`);
}
