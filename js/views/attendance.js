import * as db from "../db.js";
import { topbar, escapeHtml, formatDate, STATUS_META, GENDER_SYMBOL, GENDER_LABEL } from "../ui.js";

const STATUS_ORDER = ["anwesend", "abwesend", "vergessen", "unfaehig"];

export async function renderAttendance(app, sessionId) {
  const session = await db.getSession(sessionId);
  if (!session) {
    app.innerHTML = `<div class="container"><div class="card">Termin nicht gefunden. <a href="#/">Zurück</a></div></div>`;
    return;
  }
  const course = await db.getCourse(session.courseId);
  const students = await db.getStudentsByCourse(session.courseId);
  const records = await db.getRecordsBySession(sessionId);
  const recordByStudent = new Map(records.map((r) => [r.studentId, r]));

  app.innerHTML = `
    ${topbar({ title: `${escapeHtml(course.name)} · ${formatDate(session.date)}`, back: `#/course/${session.courseId}` })}
    <div class="counter-bar" id="counter-bar"></div>
    <div class="container">
      <div class="section-title">Abfahrt in der Schule – Anwesenheit</div>
      <div id="student-cards">
        ${students.map((s) => studentCard(s, recordByStudent.get(s.id))).join("")}
      </div>
    </div>
    <div class="bottombar">
      <a class="btn btn-primary btn-block btn-lg" href="#/session/${sessionId}/pool">Weiter zur Schwimmhalle →</a>
    </div>
  `;

  function studentCard(s, record) {
    const status = record?.status;
    return `
      <div class="student-card" data-student="${s.id}">
        <div class="name-row">
          ${escapeHtml(s.name)}
          <span class="gender-badge">${GENDER_SYMBOL[s.gender]} ${GENDER_LABEL[s.gender]}</span>
        </div>
        <div class="status-grid">
          ${STATUS_ORDER.map(
            (st) => `
            <button
              class="status-btn ${status === st ? "active" : ""}"
              data-status="${st}"
              data-student="${s.id}"
            >
              <span class="emoji">${STATUS_META[st].emoji}</span>
              <span>${STATUS_META[st].label}</span>
            </button>
          `
          ).join("")}
        </div>
      </div>
    `;
  }

  function updateCounterBar() {
    const counts = { m: 0, w: 0, d: 0 };
    for (const s of students) {
      const r = recordByStudent.get(s.id);
      if (r?.status === "anwesend") counts[s.gender] = (counts[s.gender] || 0) + 1;
    }
    const bar = document.getElementById("counter-bar");
    bar.innerHTML = `
      <div class="counter-pill"><span class="sym">♂</span> ${counts.m || 0}</div>
      <div class="counter-pill"><span class="sym">♀</span> ${counts.w || 0}</div>
      ${counts.d ? `<div class="counter-pill"><span class="sym">⚧</span> ${counts.d}</div>` : ""}
    `;
  }

  document.getElementById("student-cards").addEventListener("click", async (e) => {
    const btn = e.target.closest(".status-btn");
    if (!btn) return;
    const studentId = btn.getAttribute("data-student");
    const status = btn.getAttribute("data-status");
    const card = btn.closest(".student-card");

    const record = await db.upsertRecord(sessionId, studentId, { status });
    recordByStudent.set(studentId, record);

    card.querySelectorAll(".status-btn").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-status") === status);
    });
    updateCounterBar();
  });

  updateCounterBar();
}
