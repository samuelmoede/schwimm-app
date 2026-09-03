import * as db from "../db.js";
import { topbar, escapeHtml, formatDate } from "../ui.js";
import { icon } from "../icons.js";

// Everyone is assumed present by default - only exceptions need a tap.
const EXCEPTIONS = [
  { status: "abwesend", label: "Abwesend", short: "Abw.", iconName: "close" },
  { status: "vergessen", label: "Sachen vergessen", short: "Verg.", iconName: "backpack" },
  { status: "unfaehig", label: "Nicht schwimmfähig", short: "Unf.", iconName: "thermometer" },
];

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
      <div class="section-title">Abfahrt in der Schule</div>
      <p class="muted" style="margin-top:-0.4rem;">Alle gelten als anwesend. Nur Ausnahmen antippen.</p>
      <div class="list" id="roll-list">
        ${students.map((s) => rollRow(s, recordByStudent.get(s.id)?.status)).join("")}
      </div>
    </div>
    <div class="bottombar">
      <a class="btn btn-primary btn-block btn-lg" href="#/session/${sessionId}/pool">Weiter zur Schwimmhalle</a>
    </div>
  `;

  function rollRow(s, status) {
    const isDefault = !status || status === "anwesend";
    return `
      <div class="roll-row ${isDefault ? "is-present-default" : ""}" data-student="${s.id}">
        <div class="roll-name">${escapeHtml(s.name)}</div>
        <div class="roll-actions">
          ${EXCEPTIONS.map(
            (e) => `
            <button
              class="exc-btn ${status === e.status ? "active" : ""}"
              data-exc="${e.status}"
              data-student="${s.id}"
              title="${e.label}"
              aria-label="${e.label}"
            >
              ${icon(e.iconName, { size: 18 })}
              <span>${e.short}</span>
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
      const status = recordByStudent.get(s.id)?.status;
      if (status !== "abwesend") counts[s.gender] = (counts[s.gender] || 0) + 1;
    }
    const bar = document.getElementById("counter-bar");
    bar.innerHTML = `
      <div class="counter-pill"><span class="sym">♂</span> ${counts.m || 0}</div>
      <div class="counter-pill"><span class="sym">♀</span> ${counts.w || 0}</div>
      ${counts.d ? `<div class="counter-pill"><span class="sym">⚧</span> ${counts.d}</div>` : ""}
    `;
  }

  document.getElementById("roll-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".exc-btn");
    if (!btn) return;
    const studentId = btn.getAttribute("data-student");
    const exc = btn.getAttribute("data-exc");
    const row = btn.closest(".roll-row");
    const wasActive = btn.classList.contains("active");
    const newStatus = wasActive ? "anwesend" : exc;

    // Update immediately so tapping through a long roster feels instant; the
    // write to IndexedDB happens in the background (still ordered correctly).
    row.querySelectorAll(".exc-btn").forEach((b) => {
      b.classList.toggle("active", !wasActive && b.getAttribute("data-exc") === exc);
    });
    row.classList.toggle("is-present-default", newStatus === "anwesend");
    recordByStudent.set(studentId, { ...(recordByStudent.get(studentId) || {}), status: newStatus });
    updateCounterBar();

    db.upsertRecord(sessionId, studentId, { status: newStatus }).then((record) => {
      recordByStudent.set(studentId, record);
    });
  });

  updateCounterBar();
}
