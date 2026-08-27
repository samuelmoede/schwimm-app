import * as db from "../db.js";
import { topbar, escapeHtml, formatDate, toast, STATUS_META, GENDER_LABEL } from "../ui.js";
import { toCSV, downloadTextFile } from "../csv.js";

const DISCIPLINE_KEYS = ["wagnissprung", "tauchen", "ausdauer", "brust", "kraul", "ruecken"];
const DISCIPLINE_LABELS = {
  wagnissprung: "Wagnissprung",
  tauchen: "Tauchen",
  ausdauer: "Ausdauer",
  brust: "Brust",
  kraul: "Kraul",
  ruecken: "Rücken",
};

export async function renderHistory(app, courseId) {
  const course = await db.getCourse(courseId);
  if (!course) {
    app.innerHTML = `<div class="container"><div class="card">Kurs nicht gefunden. <a href="#/">Zurück</a></div></div>`;
    return;
  }
  const students = await db.getStudentsByCourse(courseId);
  const sessions = await db.getSessionsByCourse(courseId);

  app.innerHTML = `
    ${topbar({ title: `Verlauf – ${escapeHtml(course.name)}`, back: `#/course/${courseId}` })}
    <div class="container">
      <div class="card">
        <h2>Notenübersicht exportieren</h2>
        <p class="muted">Eine Zeile pro Schüler:in und Termin, als CSV zum Öffnen in Excel/LibreOffice.</p>
        <button class="btn btn-primary btn-block" id="export-course-csv">📊 CSV exportieren</button>
      </div>

      <div class="section-title">Termine (${sessions.length})</div>
      ${
        sessions.length === 0
          ? `<div class="empty-state muted">Noch keine Termine erfasst.</div>`
          : `<div class="list">${sessions.map(sessionRow).join("")}</div>`
      }
    </div>
  `;

  function sessionRow(s) {
    return `
      <a class="list-item" href="#/session/${s.id}/attendance">
        <span class="title">
          ${formatDate(s.date)}
          ${s.note ? `<div class="muted" style="font-weight:400; font-size:0.85rem; margin-top:0.2rem;">${escapeHtml(s.note)}</div>` : ""}
        </span>
        <span class="chevron">›</span>
      </a>
    `;
  }

  document.getElementById("export-course-csv").addEventListener("click", async () => {
    const rows = [];
    for (const session of sessions) {
      const records = await db.getRecordsBySession(session.id);
      const byStudent = new Map(records.map((r) => [r.studentId, r]));
      for (const s of students) {
        const r = byStudent.get(s.id);
        const row = {
          datum: session.date,
          stundeninhalt: session.note || "",
          name: s.name,
          geschlecht: GENDER_LABEL[s.gender] || s.gender,
          status: r?.status ? STATUS_META[r.status].label : "",
          kommentar: r?.comment || "",
        };
        for (const key of DISCIPLINE_KEYS) {
          row[key] = r?.disciplines?.[key] || "";
        }
        rows.push(row);
      }
    }
    const headers = ["datum", "name", "geschlecht", "status", ...DISCIPLINE_KEYS, "kommentar", "stundeninhalt"];
    downloadTextFile(
      `${course.name.replace(/[^a-z0-9]+/gi, "_")}_notenuebersicht.csv`,
      toCSV(rows, headers)
    );
    toast("CSV wird heruntergeladen");
  });
}
