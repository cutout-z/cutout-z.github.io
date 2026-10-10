/* Static export only: base.html includes this when the page was rendered by
   scripts/export_static.py (the `static_export` global). The live app never loads it.

   A static host ignores query strings, so an HTMX GET such as /partials/au-mix?view=Risked cannot
   reach a route. The export pre-rendered every fragment reachable through an enumerable control
   (a select option, a radio value, a tab, a sort header, a pager) by calling the real route, and
   saved each as fragments/<key>.html. This maps an HTMX GET to that file. It computes nothing:
   no sorting, no filtering, no rendering.

   key = FNV-1a (two 32-bit passes, hex) of the canonical request: the path, then the non-empty
   parameters as encodeURIComponent "k=v" pairs, sorted, joined with "&". export_static.py builds
   the same string (see canonical() there); fragments/manifest.json lists every key it wrote.

   A request the export did not pre-render (free input: search, a slider, a date, a number, a
   column choice, a large checkbox filter) gets a 404, and a notice says it needs the live app.

   Ages. The export froze every "N d" and stale mark at its build. Each signal's age carries the dates
   it is aged by (partials/_signals.html: data-as-of, data-stale-after, data-checked-on, data-aged-from, the last
   three absent when every input is frozen; data-aged-from is a later review, T2's curation pass), so they are counted on to the viewer's today, by the rule of
   app/risk/readings.py read(): stale when older than its limit, or when half its MW was last checked
   longer ago than that. Only ever older: a row the build marked stale, for any reason, stays stale, and
   a clock behind the build changes nothing. When the build is over 36 hours old, a banner at the top of
   main says so (base.html, data-snapshot-banner). */
(function () {
  "use strict";
  const BASE = (document.currentScript && document.currentScript.dataset.base) || "/";

  function fnv(s, h) {
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16).padStart(8, "0");
  }
  function canonical(path, pairs) {
    const kv = pairs.filter(([, v]) => v !== "")
      .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).sort();
    return path + "?" + kv.join("&");
  }
  const key = c => fnv(c, 2166136261) + fnv(c, 3735928559);
  window.STATIC_EXPORT = { base: BASE, canonical, key };

  document.addEventListener("htmx:configRequest", e => {
    const d = e.detail;
    if (d.verb !== "get") return;
    const [path, qs] = d.path.split("#")[0].split("?");
    const pairs = [];
    new URLSearchParams(qs || "").forEach((v, k) => pairs.push([k, v]));
    for (const [k, v] of d.formData.entries()) pairs.push([k, String(v)]);
    const c = canonical(path, pairs);
    d.path = BASE + "fragments/" + key(c) + ".html";
    d.useUrlParams = false;
    window.STATIC_EXPORT.last = c;   // the canonical request, for verification and the miss notice
  });

  let note, timer;
  function miss(e) {
    if (!note) {
      note = document.createElement("div");
      note.setAttribute("role", "status");
      note.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:60;" +
        "max-width:min(520px,calc(100vw - 32px));padding:10px 14px;border-radius:10px;font-size:13px;" +
        "line-height:1.45;background:var(--surface);color:var(--text);box-shadow:var(--shadow-pop)";
      document.body.appendChild(note);
    }
    note.textContent = "This view needs the live app: the static site only has the selections it " +
      "pre-rendered. What is on screen is unchanged.";
    note.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => { note.hidden = true; }, 6000);
    window.STATIC_EXPORT.lastMiss = window.STATIC_EXPORT.last;
  }
  document.addEventListener("htmx:responseError", miss);
  document.addEventListener("htmx:sendError", miss);

  // ---------------------------------------------------------------- ages, counted to today
  const DAY = 864e5;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayOf = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY;   // the viewer's calendar day
  const isoDay = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d) / DAY; };
  const said = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return d + " " + MONTHS[m - 1] + " " + y; };
  const today = dayOf(new Date());
  const counted = new Set();   // signals this page turned stale, each counted once
  window.STATIC_EXPORT.ages = { today: new Date(today * DAY).toISOString().slice(0, 10), stale: [] };

  function reage(root) {
    root.querySelectorAll("[data-age][data-as-of]").forEach(el => {
      const age = today - isoDay(el.dataset.asOf);
      if (!(age > parseInt(el.textContent, 10))) return;   // as the build counted it, or a clock behind it
      el.textContent = age + " d";
      if (!el.dataset.staleAfter) return;                  // frozen: never aged
      const next = el.nextElementSibling;
      if (next && next.hasAttribute("data-stale-badge")) return;   // stale at the build, for its own reason
      const limit = parseInt(el.dataset.staleAfter, 10), on = el.dataset.checkedOn, from = el.dataset.agedFrom;
      // a later review (T2's curation pass) moves where the limit counts from, never the age shown
      const why = from ? (today - isoDay(from) > limit ? "Last checked on " + said(from) + ", over its " + limit + "-day limit" : null)
        : age > limit ? "Older than its " + limit + "-day limit"
        : on && today - isoDay(on) > limit ? "Half its MW was last checked on " + said(on) + ", over its " + limit + "-day limit"
        : null;
      if (!why) return;
      const badge = document.createElement("span");
      badge.className = "badge h-5 px-1.5 text-[11px]";
      badge.setAttribute("data-stale-badge", "");
      badge.title = why + " (counted to today in this browser)";
      badge.textContent = "stale";
      el.after(" ", badge);
      const id = el.dataset.signal;
      if (!id || counted.has(id)) return;
      counted.add(id);
      window.STATIC_EXPORT.ages.stale.push(id);
      // the cockpit's "N live · M stale", and its "what changed" line for the same signal
      const live = document.querySelector('[data-count="live"]'), stale = document.querySelector('[data-count="stale"]');
      if (live && stale) {
        live.textContent = String(parseInt(live.textContent, 10) - 1);
        stale.textContent = String(parseInt(stale.textContent, 10) + 1);
      }
      document.querySelectorAll("[data-strip-stale]").forEach(s => {
        if (s.dataset.stripStale === id && !s.textContent.trim()) s.textContent = " · stale";
      });
    });
  }
  reage(document);
  document.addEventListener("htmx:afterSwap", e => reage(e.detail.elt || document));

  // ---------------------------------------------------------------- the snapshot's own age
  const stamp = document.querySelector("header time[datetime]");
  const banner = document.querySelector("[data-snapshot-banner]");
  const built = stamp && Date.parse(stamp.getAttribute("datetime"));
  if (banner && built && Date.now() - built > 36 * 36e5) {
    let gone = false;
    try { gone = sessionStorage.getItem("snapshot-banner") === stamp.getAttribute("datetime"); } catch (e) {}
    const days = Math.max(1, today - dayOf(new Date(built)));
    banner.querySelector("[data-snapshot-days]").textContent = days + (days === 1 ? " day" : " days");
    if (!document.querySelector("[data-age]")) {
      banner.querySelector("[data-snapshot-ages]").textContent = "Ages and stale marks on this page are as of that build.";
    }
    banner.classList.toggle("hidden", gone);
    banner.querySelector("[data-snapshot-dismiss]").addEventListener("click", () => {
      banner.classList.add("hidden");
      try { sessionStorage.setItem("snapshot-banner", stamp.getAttribute("datetime")); } catch (e) {}
    });
    window.STATIC_EXPORT.builtDaysAgo = days;
  }
})();
