// Links from the risk alerts end in ?focus=<id> (several ids comma-separated).
// The page marks rows with data-focus="<id>"; this scrolls to the first one and
// highlights them all for a few seconds. It keeps looking for a while, because the
// rows usually arrive from the API after the page has opened.

export function queryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

// Room for the site's sticky header, so a target's top isn't hidden under it.
const HEADER_OFFSET = 150;

// Centres the target when it fits, but never lets its top slide under the sticky
// header, so a tall card or section is shown from its heading.
function scrollToTarget(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const gapAbove = Math.max(HEADER_OFFSET, (window.innerHeight - rect.height) / 2);
  window.scrollTo({ top: rect.top + window.scrollY - gapAbove, behavior: "smooth" });
}

const HIGHLIGHT_MS = 3500;
const GIVE_UP_MS = 8000;

export function highlightFocusTarget(): () => void {
  const focus = queryParam("focus");
  if (!focus) return () => {};
  const ids = focus.split(",").map(s => s.trim()).filter(Boolean);
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const find = () => ids
    .map(id => document.querySelector<HTMLElement>(`[data-focus="${CSS.escape(id)}"]`))
    .filter((el): el is HTMLElement => el !== null);

  const attempt = () => {
    const found = find();
    if (found.length === ids.length || (found.length > 0 && Date.now() - started > 2000)) {
      scrollToTarget(found[0]);
      found.forEach(el => el.classList.add("focus-flash"));
      timer = setTimeout(() => found.forEach(el => el.classList.remove("focus-flash")), HIGHLIGHT_MS);
      return;
    }
    if (Date.now() - started < GIVE_UP_MS) timer = setTimeout(attempt, 200);
  };
  attempt();
  return () => { if (timer) clearTimeout(timer); };
}
