/* ==================================================================================================
   handspike-visitors — the counter behind the number in the footer
   ==================================================================================================

   WHY IT LIVES HERE AND NOT ON THE TRADING BOX. index.html says it out loud, next to the live return
   badge: "no API, no inbound path to the trading machine." The box at 34.26.107.47 runs real money
   and is reachable only over Tailscale. Opening a public HTTP endpoint on it so a footer could show a
   number would trade a genuine security property for a trinket. This worker is a separate machine on
   a separate account, and the only thing it knows is a set of opaque hashes.

   WHY IT IS NOT A THIRD-PARTY TRACKER. The page this number sits on argues that you should own your
   broker, your model, your server and your keys. Pasting someone else's analytics beacon into its
   footer would be the one place on the site where the argument does not apply to itself. Nothing here
   leaves the owner's own Cloudflare account.

   WHAT "UNIQUE" MEANS HERE — and it is a narrower claim than most counters make:

     A visitor is counted ONCE, EVER. Not once per day, not once per session. The stored identity is
     sha256(secret salt | truncated IP | user-agent | accept-language), 128 bits of it, and that is
     the entire record. No IP, no timestamp, no page, no referrer, no cookie, no localStorage.

   The salt is a Worker secret, so the hashes are not reversible by anyone holding only the database —
   without it, the 2^32 IPv4 space is enumerable in seconds and "hashed" would mean nothing. IPv6 is
   truncated to its /64 before hashing, because the low 64 bits rotate on most consumer connections
   and an untruncated IPv6 address would count one person as a new visitor every few days.

   The consequence, stated plainly rather than buried: a stable hash is a pseudonymous identifier held
   for the life of the counter. That is what an all-time unique count requires and there is no version
   of it that does not. A daily-rotating salt would be strictly more private and would answer a
   different question ("uniques today"), which is not the question the footer asks.

   THREE FILTERS, BECAUSE A COUNTER THAT COUNTS CRAWLERS IS A FABRICATED NUMBER. A GitHub Pages site
   is crawled far more than it is read, and a footer reading "14,000 visitors" that is really 13,900
   bots is worse than no footer at all:

     1. The count is driven by client-side JS. Most crawlers never run it.
     2. It is a POST. Almost nothing that crawls sends one.
     3. The Origin must be handspike.dev, which also stops another site from pointing a beacon here.
     4. Known crawler user-agents are rejected even if they clear the first three.

   ON FAILURE IT RETURNS AN ERROR, NEVER A NUMBER. The page hides the counter when this endpoint does
   not answer cleanly, exactly as it hides the live return badge. Silence beats a figure nobody can
   stand behind — that rule is inherited from index.html and it applies here too.
   ================================================================================================== */

const ALLOWED_ORIGINS = new Set([
  "https://handspike.dev",
  "https://www.handspike.dev",
  // Local development only. It cannot inflate the live number: a request from here still has to be
  // a real browser on a real IP, and it lands in the same table as any other visitor.
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

// Deliberately blunt. A false positive costs one uncounted reader; a false negative puts a robot in a
// number presented to humans. The asymmetry is the whole argument for erring wide.
const BOT = new RegExp(
  [
    "bot", "crawl", "spider", "slurp", "scrap", "fetcher", "archiver", "index",
    "headless", "phantom", "puppeteer", "playwright", "selenium", "lighthouse",
    "curl", "wget", "python", "requests", "httpx", "aiohttp", "scrapy", "axios",
    "node-fetch", "go-http", "java/", "okhttp", "libwww", "perl", "ruby",
    "monitor", "uptime", "pingdom", "statuscake", "datadog", "newrelic",
    "preview", "embed", "facebookexternal", "whatsapp", "telegram", "discord",
    "gptbot", "claudebot", "ccbot", "perplexity", "anthropic", "openai", "bytespider",
  ].join("|"),
  "i",
);

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      // Vary matters: the allow-origin header differs per caller, and a cache that missed this would
      // hand one origin's permission slip to another.
      vary: "Origin",
      ...(origin ? { "access-control-allow-origin": origin } : {}),
    },
  });

/**
 * IPv6 down to its /64. Consumer ISPs rotate the interface half; the prefix is the subscriber.
 *
 * The dotted-quad guard is not decoration. An IPv4-mapped address (::ffff:203.0.113.7) is a colon
 * form whose first four groups are all zero, so truncating it as IPv6 would map EVERY such visitor
 * onto the single bucket "0:0:0:0" and count the lot of them as one person. Cloudflare does not send
 * CF-Connecting-IP in that form today, which is exactly why this would have gone unnoticed if it ever
 * started to.
 */
function stableIp(ip) {
  if (!ip) return "";
  if (!ip.includes(":")) return ip; // IPv4 — keep it whole
  if (ip.includes(".")) {
    const quad = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(ip);
    if (quad) return quad[1];
  }
  const expanded = ip.split("%")[0].toLowerCase();
  const parts = expanded.split(":");
  // Handle the :: compression by rebuilding to eight groups before taking the first four.
  if (expanded.includes("::")) {
    const [head, tail] = expanded.split("::");
    const h = head ? head.split(":") : [];
    const t = tail ? tail.split(":") : [];
    const fill = new Array(Math.max(0, 8 - h.length - t.length)).fill("0");
    return [...h, ...fill, ...t].slice(0, 4).join(":");
  }
  return parts.slice(0, 4).join(":");
}

async function visitorHash(salt, req) {
  const ip = stableIp(req.headers.get("cf-connecting-ip") || "");
  const ua = req.headers.get("user-agent") || "";
  const lang = req.headers.get("accept-language") || "";
  // Accept-language is in here for entropy, not for interest: without it, everyone behind one NAT
  // running the same browser build collapses into a single visitor.
  const material = `${salt}|${ip}|${ua}|${lang}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)]
    .slice(0, 16) // 128 bits — collisions are not a thing worth storing 256 bits to avoid
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";
    const allowed = ALLOWED_ORIGINS.has(origin) ? origin : null;

    if (request.method === "OPTIONS") {
      // The live beacon is a simple request and never preflights. This is here so that stops being
      // true silently if someone later adds a header to the fetch.
      return new Response(null, {
        status: allowed ? 204 : 403,
        headers: {
          vary: "Origin",
          ...(allowed
            ? {
                "access-control-allow-origin": allowed,
                "access-control-allow-methods": "POST, OPTIONS",
                "access-control-max-age": "86400",
              }
            : {}),
        },
      });
    }

    if (!allowed) return json({ error: "origin" }, 403, null);
    if (request.method !== "POST") return json({ error: "method" }, 405, allowed);

    const ua = request.headers.get("user-agent") || "";
    // An empty user-agent is not a browser. Browsers always send one.
    if (!ua || BOT.test(ua)) return json({ error: "excluded" }, 403, allowed);

    // FAIL CLOSED ON A MISSING SALT. The tempting fallback — hash without it — would quietly turn
    // every stored hash into a reversible IP. There is no degraded mode worth having here.
    const salt = env.VISITOR_SALT;
    if (!salt) return json({ error: "unconfigured: set the VISITOR_SALT secret" }, 503, allowed);

    // NO ADDRESS, NO COUNT. Cloudflare always sets CF-Connecting-IP, so this should never fire in
    // production — and that is the point. If it ever stopped being set, the hash would fall back to
    // user-agent alone and quietly fuse every Chrome-on-Windows reader in the world into a single
    // "visitor". A counter that answers wrongly is worse than one that does not answer.
    if (!stableIp(request.headers.get("cf-connecting-ip") || "")) {
      return json({ error: "no client address" }, 400, allowed);
    }

    try {
      const h = await visitorHash(salt, request);

      // Read before write, so a returning visitor costs a read and nothing else. At this traffic the
      // saving is irrelevant; the point is that a repeat view leaves no new trace at all.
      const seen = await env.DB.prepare("SELECT 1 FROM visitors WHERE h = ?1").bind(h).first();
      if (!seen) {
        await env.DB.prepare("INSERT OR IGNORE INTO visitors (h) VALUES (?1)").bind(h).run();
      }

      // COUNT(*) rather than a running total kept in a second row. A stored counter can drift from
      // the table it claims to describe — on a retried write, on a partial failure — and then the
      // published number and the record behind it disagree with no way to tell which is wrong.
      // Counting the rows makes that class of bug unrepresentable.
      const [countRow, sinceRow] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS n FROM visitors").first(),
        env.DB.prepare("SELECT v FROM meta WHERE k = 'since'").first(),
      ]);

      let since = sinceRow ? sinceRow.v : null;
      if (!since) {
        // Day granularity on purpose. This exists to give the number a window ("since 7 Sep"), which
        // a bare all-time total badly needs, and nothing finer than a date serves that.
        since = new Date().toISOString().slice(0, 10);
        await env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('since', ?1)")
          .bind(since)
          .run();
        const confirm = await env.DB.prepare("SELECT v FROM meta WHERE k = 'since'").first();
        if (confirm) since = confirm.v;
      }

      return json({ unique: countRow ? countRow.n : 0, since }, 200, allowed);
    } catch (err) {
      // No number on a bad read. The footer stays empty and the page is still complete without it.
      return json({ error: "unavailable" }, 500, allowed);
    }
  },
};
