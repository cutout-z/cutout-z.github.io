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
   column choice, a large checkbox filter) gets a 404, and a notice says it needs the live app. */
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
})();
