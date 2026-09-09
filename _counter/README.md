# The visitor counter

The number in the footer of handspike.dev — *"1,284 unique visitors since 7 Sep 2026"*.

Three files do the whole job:

| | |
|---|---|
| `src/worker.js` | a Cloudflare Worker: takes a POST, decides whether it has seen this visitor before |
| `schema.sql`    | two tables, one of which has a single column |
| `../visitors.js` | the beacon on the site, and the thing that renders the number |

## Why it is built this way

**It is not on the trading box.** `index.html` states the constraint next to the live return badge:
*"no API, no inbound path to the trading machine."* The box at `34.26.107.47` runs real money and is
reachable only over Tailscale. Opening a public HTTP endpoint on it so a footer could show a number
would spend a real security property on a trinket.

**It is not a third-party tracker.** The page this number sits on argues that you should own your
broker, your model, your server and your keys. A rented analytics beacon in its footer would be the
one place on the site where the argument does not apply to itself. Nothing leaves the owner's own
Cloudflare account — the same account that already serves the DNS for the domain.

**It counts people, not requests.** A visitor is counted **once, ever**. The stored record is
`sha256(secret salt | truncated IP | user-agent | accept-language)`, 128 bits of it, and that is the
entire row: no IP, no timestamp, no page, no referrer, no cookie, no localStorage. The salt is a
Worker secret, so the hashes are not reversible by anyone holding only the database.

**It excludes crawlers, in four independent ways.** A GitHub Pages site is crawled far more than it
is read, and a footer reading "14,000 visitors" that is really 13,900 robots is worse than no footer.
The count needs client-side JS, needs to be a POST, needs an `Origin` of handspike.dev, and is
refused outright for known crawler user-agents.

**On failure it shows nothing.** Every error path returns an error, never a number, and the page
hides the counter whenever it does not get a clean answer — the same rule the live return badge
follows. Silence beats a figure nobody can stand behind.

## Standing it up

```powershell
npx wrangler login                                                    # opens a browser; do this once
powershell -NoProfile -ExecutionPolicy Bypass -File _counter\deploy.ps1
```

`deploy.ps1` creates the D1 database, applies the schema, deploys the worker, generates the salt, and
writes the endpoint into `../visitors.js`. It then prints the `git commit` you need — **until that
push lands, the footer stays blank, which is the correct thing for it to do.**

Re-running it is safe. It will not rotate the salt: rotating it changes every future hash, so every
returning visitor would be counted as a new one and the number would quietly restart.

## Reading the count without a browser

```powershell
npx wrangler d1 execute handspike-visitors --remote --command "SELECT COUNT(*) AS unique_visitors FROM visitors"
```

## Cost

Cloudflare's free tier covers this with a very large margin: 100,000 Worker requests/day and 100,000
D1 writes/day, against a site whose traffic is measured in visitors per day. A repeat visit costs one
read and no write at all.

## The optional upgrade

The beacon currently posts to `handspike-visitors.<subdomain>.workers.dev`. That works, but it puts a
second hostname in the page. If the orange cloud is ever switched on for handspike.dev in the
Cloudflare dashboard (proxying the GitHub Pages origin — routine, and it does not change how the site
is served), the worker can take a route at `handspike.dev/api/visitors` instead: same origin, no CORS,
no second hostname. Change `ENDPOINT` in `../visitors.js` to `/api/visitors` and add the route to
`wrangler.toml`. Nothing else moves, and the stored count is untouched.

## Why the directory starts with an underscore

GitHub Pages runs Jekyll, and Jekyll does not publish directories whose names begin with `_`. The
source is versioned alongside the site it serves, but `handspike.dev/_counter/…` is not a URL.
