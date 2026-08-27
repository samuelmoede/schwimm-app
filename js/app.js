import { renderCourses } from "./views/courses.js";
import { renderCourse } from "./views/course.js";
import { renderRoster } from "./views/roster.js";
import { renderHistory } from "./views/history.js";
import { renderAttendance } from "./views/attendance.js";
import { renderPool } from "./views/pool.js";
import { renderBackup } from "./views/backup.js";

const app = document.getElementById("app");

const routes = [
  { pattern: /^#\/$/, handler: () => renderCourses(app) },
  { pattern: /^#\/backup$/, handler: () => renderBackup(app) },
  { pattern: /^#\/course\/([^/]+)$/, handler: (m) => renderCourse(app, m[1]) },
  { pattern: /^#\/course\/([^/]+)\/roster$/, handler: (m) => renderRoster(app, m[1]) },
  { pattern: /^#\/course\/([^/]+)\/history$/, handler: (m) => renderHistory(app, m[1]) },
  { pattern: /^#\/session\/([^/]+)\/attendance$/, handler: (m) => renderAttendance(app, m[1]) },
  { pattern: /^#\/session\/([^/]+)\/pool$/, handler: (m) => renderPool(app, m[1]) },
];

async function router() {
  const hash = location.hash || "#/";
  for (const route of routes) {
    const m = hash.match(route.pattern);
    if (m) {
      app.scrollTop = 0;
      window.scrollTo(0, 0);
      try {
        await route.handler(m);
      } catch (err) {
        console.error(err);
        app.innerHTML = `<div class="container"><div class="card"><h2>Fehler</h2><p>${escapeHtml(
          err.message || String(err)
        )}</p><a class="btn btn-primary" href="#/">Zur Startseite</a></div></div>`;
      }
      return;
    }
  }
  location.hash = "#/";
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
if (document.readyState !== "loading") router();

// Offline indicator – purely informational, the app works fully offline anyway.
function updateOnlineState() {
  document.body.classList.toggle("is-offline", !navigator.onLine);
}
window.addEventListener("online", updateOnlineState);
window.addEventListener("offline", updateOnlineState);
updateOnlineState();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("Service Worker nicht verfügbar:", err));
  });
}
