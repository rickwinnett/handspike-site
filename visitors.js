/* ==================================================================================================
   visitors.js — the footer counter
   ==================================================================================================

   Shared chrome, in a shared file, for the reason site.css states at the top of itself: every time a
   piece of this site's furniture was pasted into individual pages, the copies drifted. The counter is
   furniture. It lives once, here.

   IT COUNTS ON EVERY PUBLIC PAGE, NOT JUST THE ONES THAT SHOW IT. If the beacon only fired where the
   number is displayed, the footer would say "unique visitors" while measuring "unique visitors who
   happened to land on a page with a footer" — someone arriving at /eleven-failures.html from a link
   would be invisible. That is a small lie of exactly the kind the rest of this site works to avoid.
   The number is DISPLAYED wherever a #visitors element exists; it is COUNTED wherever this file
   loads. login.html carries neither: it is the operator's door to the cockpit, not site traffic.

   THE THREE BEHAVIOURS ARE THE ONES THE LIVE RETURN BADGE FOLLOWS, deliberately:

     1. ANY failure — no endpoint, network error, bad JSON, missing number — leaves the counter
        hidden. A number this page cannot verify is a number it does not show.
     2. The window is printed BESIDE the number, never implied. "1,284 unique visitors" alone is an
        unanchored figure; "since 7 Sep 2026" is what makes it mean anything.
     3. There is no client-side state. No cookie, no localStorage, no fingerprinting script. The
        deduplication happens at the endpoint, against a salted hash it cannot reverse, and this file
        sends nothing but the request itself.

   WHAT GETS SENT: a POST with no body and no custom headers — which is why it needs no CORS
   preflight. The endpoint sees what any web server sees, and keeps none of it. See
   _counter/src/worker.js for what it does with those headers, which is: salt, hash, truncate to 128
   bits, store that, discard the rest.
   ================================================================================================== */
(function () {
  // Written by _counter/deploy.ps1 on a successful deploy. Empty means the counter has not been
  // stood up yet, and the correct behaviour then is to do nothing whatsoever — not to fetch a URL
  // that is not there, and certainly not to render a placeholder.
  var ENDPOINT = '';

  if (!ENDPOINT) return;

  var NBSP = '\u00a0';    // non-breaking space, as an ESCAPE: a literal one is invisible in
  var MIDDOT = '\u00b7';   // source and one careless edit turns it back into a plain space.
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // "2026-09-07" -> "7 Sep 2026". Split by hand rather than parsed through Date, so that a reader in
  // a timezone behind UTC is not shown the previous day.
  function niceDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    var mon = MONTHS[parseInt(m[2], 10) - 1];
    if (!mon) return null;
    return parseInt(m[3], 10) + ' ' + mon + ' ' + m[1];
  }

  function render(el, d) {
    var n = Math.floor(d.unique);
    var since = niceDate(d.since);

    // The separator is non-breaking on both sides, matching the &nbsp;·&nbsp; the footer colophon
    // already uses. An ordinary space would let a narrow screen break the line directly before the
    // dot and orphan it at the start of the next row.
    var text = NBSP + MIDDOT + NBSP + n.toLocaleString('en-US') +
               (n === 1 ? ' unique visitor' : ' unique visitors');
    if (since) text += ' since ' + since;
    el.textContent = text;

    // The method, one gesture away rather than absent — the same place the live badge keeps its
    // basis and its age. A counter that will not say how it counts is asking to be taken on trust.
    //
    // "Unique visitors" is the conventional label and it is the one used above, but the honest
    // definition underneath it is PER BROWSER — one person on a phone and a laptop counts twice.
    // Every analytics product works this way and almost none of them says so; there is no version
    // of this that identifies a person rather than a device, and pretending otherwise would be a
    // small false claim sitting directly beneath a very carefully qualified real one.
    el.setAttribute('title',
      'Counted once per browser, ever — not once per visit. One person on a phone and a laptop ' +
      'is two. No cookies and no third party: the connecting address is salted, hashed, truncated ' +
      'and discarded, and only the hash is stored. Known crawlers are excluded and counting needs ' +
      'JavaScript, so this figure runs well below the site’s raw traffic.');
    el.hidden = false;
  }

  function count() {
    fetch(ENDPOINT, { method: 'POST', mode: 'cors', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || typeof d.unique !== 'number' || !isFinite(d.unique) || d.unique < 1) return;
        var el = document.getElementById('visitors');
        if (!el) return;                       // counted here, shown elsewhere — not a failure
        render(el, d);
      })
      .catch(function () { /* stay hidden — the footer is complete without it */ });
  }

  // A prerendered page is not a visit. Chrome can fetch and run a page the reader never opens, and
  // counting those would pad the figure with people who never came.
  if (document.prerendering) {
    document.addEventListener('prerenderingchange', count, { once: true });
  } else {
    count();
  }
})();
