export function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

export function topbar({ title, back, actionsHtml = "" }) {
  return `
    <div class="topbar">
      ${back ? `<a class="icon-btn" href="${back}" aria-label="Zurück">←</a>` : ""}
      <h1>${escapeHtml(title)}</h1>
      ${actionsHtml}
    </div>
  `;
}

let toastTimer = null;
export function toast(message) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.style.display = "none";
  }, 2200);
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const GENDER_LABEL = { m: "Junge", w: "Mädchen", d: "divers" };
export const GENDER_SYMBOL = { m: "♂", w: "♀", d: "⚧" };

export const STATUS_META = {
  anwesend: { label: "Anwesend", emoji: "✅", tag: "ok" },
  abwesend: { label: "Abwesend", emoji: "🚫", tag: "bad" },
  vergessen: { label: "Sachen vergessen", emoji: "🎒", tag: "warn" },
  unfaehig: { label: "Nicht schwimmfähig", emoji: "🤒", tag: "info" },
};

export const ACTIVE_STATUSES = ["anwesend"];
export const INACTIVE_STATUSES = ["vergessen", "unfaehig"];
