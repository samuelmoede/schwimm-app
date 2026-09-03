import * as db from "../db.js";
import { topbar, escapeHtml, toast, formatDate, todayISO } from "../ui.js";
import { icon } from "../icons.js";

export async function renderCourse(app, courseId) {
  const course = await db.getCourse(courseId);
  if (!course) {
    app.innerHTML = `<div class="container"><div class="card">Kurs nicht gefunden. <a href="#/">Zurück</a></div></div>`;
    return;
  }
  const [students, sessions] = await Promise.all([
    db.getStudentsByCourse(courseId),
    db.getSessionsByCourse(courseId),
  ]);

  const sessionRows = await Promise.all(
    sessions.map(async (s) => {
      const records = await db.getRecordsBySession(s.id);
      return { session: s, stats: computeStats(students, records) };
    })
  );

  app.innerHTML = `
    ${topbar({
      title: course.name,
      back: "#/",
      actionsHtml: `<button class="icon-btn" id="delete-course" aria-label="Kurs löschen">${icon("trash", { size: 20 })}</button>`,
    })}
    <div class="container">
      <div class="tabs">
        <a class="tab" href="#/course/${courseId}/roster">${icon("users", { size: 18 })} Schülerliste (${students.length})</a>
        <a class="tab" href="#/course/${courseId}/history">${icon("calendar", { size: 18 })} Verlauf &amp; Sicherung</a>
      </div>

      <div class="card" id="new-session-card" style="display:none;">
        <h2>Neuer Schwimmtermin</h2>
        <div class="field">
          <label for="session-date">Datum</label>
          <input type="date" id="session-date" value="${todayISO()}" />
        </div>
        <div class="row">
          <button class="btn" id="cancel-session">Abbrechen</button>
          <button class="btn btn-primary" id="save-session">Anlegen</button>
        </div>
      </div>

      <div class="section-title">Termine</div>
      ${
        students.length === 0
          ? `<div class="empty-state"><img class="big-emoji" src="./icons/icon-192.png" alt="" />Lege zuerst eine Schülerliste an.<br /><a class="btn btn-primary" href="#/course/${courseId}/roster" style="margin-top:0.75rem;">Schülerliste importieren</a></div>`
          : sessionRows.length === 0
          ? `<div class="empty-state"><img class="big-emoji" src="./icons/icon-192.png" alt="" />Noch kein Termin angelegt.<br />Tippe unten auf „+“.</div>`
          : `<div class="list">${sessionRows.map(sessionRow).join("")}</div>`
      }
    </div>
    ${students.length > 0 ? `<button class="fab" id="fab-new-session" aria-label="Neuer Termin">${icon("plus", { size: 28 })}</button>` : ""}
  `;

  function sessionRow({ session, stats }) {
    return `
      <a class="list-item" href="#/session/${session.id}/attendance">
        <span class="title">
          ${formatDate(session.date)}
          <div class="muted" style="font-weight:400; font-size:0.85rem; margin-top:0.2rem;">
            ${stats.anwesend} anwesend (♂ ${stats.m} · ♀ ${stats.w}) · ${stats.abwesend} abwesend
          </div>
        </span>
        <span class="chevron">${icon("chevronRight", { size: 20 })}</span>
      </a>
    `;
  }

  const newSessionCard = document.getElementById("new-session-card");
  document.getElementById("fab-new-session")?.addEventListener("click", () => {
    newSessionCard.style.display = "block";
    newSessionCard.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("cancel-session")?.addEventListener("click", () => {
    newSessionCard.style.display = "none";
  });
  document.getElementById("save-session")?.addEventListener("click", async () => {
    const date = document.getElementById("session-date").value || todayISO();
    const session = await db.addSession(courseId, date);
    location.hash = `#/session/${session.id}/attendance`;
  });

  document.getElementById("delete-course").addEventListener("click", async () => {
    if (!confirm(`Kurs „${course.name}“ inklusive aller Schüler:innen, Termine und Werte wirklich löschen?`)) return;
    await db.deleteCourse(courseId);
    toast("Kurs gelöscht");
    location.hash = "#/";
  });
}

// Students default to "anwesend" until marked otherwise - a missing record is present too.
function computeStats(students, records) {
  const statusById = new Map(records.map((r) => [r.studentId, r.status]));
  const stats = { anwesend: 0, abwesend: 0, vergessen: 0, unfaehig: 0, m: 0, w: 0 };
  for (const s of students) {
    const status = statusById.get(s.id);
    if (status === "abwesend") {
      stats.abwesend++;
      continue;
    }
    stats.anwesend++;
    if (s.gender === "m") stats.m++;
    else if (s.gender === "w") stats.w++;
    if (status === "vergessen") stats.vergessen++;
    else if (status === "unfaehig") stats.unfaehig++;
  }
  return stats;
}
