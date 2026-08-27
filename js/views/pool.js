import * as db from "../db.js";
import { topbar, escapeHtml, formatDate, STATUS_META, GENDER_SYMBOL } from "../ui.js";

const DISCIPLINES = [
  { key: "wagnissprung", label: "Wagnissprung", placeholder: "z. B. bestanden" },
  { key: "tauchen", label: "Tauchen (Distanz)", placeholder: "Meter, z. B. 10" },
  { key: "ausdauer", label: "Ausdauerschwimmen", placeholder: "z. B. 20 Min / 800 m" },
  { key: "brust", label: "Brust (Zeit)", placeholder: "mm:ss" },
  { key: "kraul", label: "Kraul (Zeit)", placeholder: "mm:ss" },
  { key: "ruecken", label: "Rücken (Zeit)", placeholder: "mm:ss" },
];

export async function renderPool(app, sessionId) {
  const session = await db.getSession(sessionId);
  if (!session) {
    app.innerHTML = `<div class="container"><div class="card">Termin nicht gefunden. <a href="#/">Zurück</a></div></div>`;
    return;
  }
  const course = await db.getCourse(session.courseId);
  const students = await db.getStudentsByCourse(session.courseId);
  const records = await db.getRecordsBySession(sessionId);
  const recordByStudent = new Map(records.map((r) => [r.studentId, r]));

  const groups = { anwesend: [], comment: [], abwesend: [], offen: [] };
  for (const s of students) {
    const status = recordByStudent.get(s.id)?.status;
    if (status === "anwesend") groups.anwesend.push(s);
    else if (status === "vergessen" || status === "unfaehig") groups.comment.push(s);
    else if (status === "abwesend") groups.abwesend.push(s);
    else groups.offen.push(s);
  }

  app.innerHTML = `
    ${topbar({
      title: `${escapeHtml(course.name)} · ${formatDate(session.date)}`,
      back: `#/session/${sessionId}/attendance`,
    })}
    <div class="container">
      <div class="card">
        <div class="field" style="margin-bottom:0;">
          <label for="session-note">Stundeninhalt – was wurde gemacht?</label>
          <textarea id="session-note" placeholder="z. B. Wiederholung Kraul-Technik, Sprünge vom Beckenrand …">${escapeHtml(
            session.note || ""
          )}</textarea>
        </div>
      </div>

      ${
        groups.offen.length
          ? `<div class="card" style="border:2px solid var(--warn);">
              <strong>⚠️ Anwesenheit fehlt für ${groups.offen.length} Schüler:in${
              groups.offen.length === 1 ? "" : "nen"
            }:</strong>
              <div class="muted" style="margin-top:0.3rem;">${groups.offen.map((s) => escapeHtml(s.name)).join(", ")}</div>
              <a class="btn" href="#/session/${sessionId}/attendance" style="margin-top:0.6rem;">Zur Anwesenheit</a>
            </div>`
          : ""
      }

      <div class="section-title">Aktiv – Disziplinen (${groups.anwesend.length})</div>
      ${
        groups.anwesend.length === 0
          ? `<div class="empty-state muted">Niemand als „anwesend“ markiert.</div>`
          : groups.anwesend.map(activeCard).join("")
      }

      <div class="section-title">Nicht schwimmfähig – Kommentar (${groups.comment.length})</div>
      ${
        groups.comment.length === 0
          ? `<div class="empty-state muted">Niemand in dieser Kategorie.</div>`
          : groups.comment.map(commentCard).join("")
      }

      ${
        groups.abwesend.length
          ? `<div class="section-title">Abwesend (${groups.abwesend.length})</div>
             <div class="card muted">${groups.abwesend.map((s) => escapeHtml(s.name)).join(", ")}</div>`
          : ""
      }
    </div>
  `;

  function activeCard(s) {
    const record = recordByStudent.get(s.id);
    const values = record?.disciplines || {};
    return `
      <div class="student-card">
        <div class="name-row">${GENDER_SYMBOL[s.gender]} ${escapeHtml(s.name)}</div>
        <div class="discipline-grid">
          ${DISCIPLINES.map(
            (d) => `
            <div class="field">
              <label for="d-${d.key}-${s.id}">${d.label}</label>
              <input
                type="text"
                inputmode="decimal"
                id="d-${d.key}-${s.id}"
                data-student="${s.id}"
                data-discipline="${d.key}"
                placeholder="${d.placeholder}"
                value="${escapeHtml(values[d.key] || "")}"
              />
            </div>
          `
          ).join("")}
        </div>
      </div>
    `;
  }

  function commentCard(s) {
    const record = recordByStudent.get(s.id);
    const status = record?.status;
    return `
      <div class="student-card">
        <div class="name-row">
          ${GENDER_SYMBOL[s.gender]} ${escapeHtml(s.name)}
          <span class="tag ${STATUS_META[status].tag}">${STATUS_META[status].emoji} ${STATUS_META[status].label}</span>
        </div>
        <div class="field" style="margin-bottom:0;">
          <label for="c-${s.id}">Kommentar</label>
          <textarea id="c-${s.id}" data-student="${s.id}" placeholder="z. B. Aufgaben gut vom Beckenrand mitbearbeitet">${escapeHtml(
      record?.comment || ""
    )}</textarea>
        </div>
      </div>
    `;
  }

  document.getElementById("session-note").addEventListener("change", async (e) => {
    await db.updateSession(sessionId, { note: e.target.value });
  });

  app.querySelectorAll("[data-discipline]").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const studentId = e.target.getAttribute("data-student");
      const key = e.target.getAttribute("data-discipline");
      await db.upsertRecord(sessionId, studentId, { disciplines: { [key]: e.target.value } });
    });
  });

  app.querySelectorAll("textarea[id^='c-']").forEach((textarea) => {
    textarea.addEventListener("change", async (e) => {
      const studentId = e.target.getAttribute("data-student");
      await db.upsertRecord(sessionId, studentId, { comment: e.target.value });
    });
  });
}
