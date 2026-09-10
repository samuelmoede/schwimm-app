import * as db from "../db.js";
import { topbar, escapeHtml, formatDate } from "../ui.js";
import { icon } from "../icons.js";

// Every student needs an explicit status - there is no default. Only once
// everyone has been tapped can the teacher move on.
const STATUS_OPTIONS = [
  { status: "anwesend", label: "Anwesend", short: "Anw.", iconName: "check" },
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
      <p class="muted" style="margin-top:-0.4rem;">Für jede Schülerin/jeden Schüler einen Status antippen.</p>
      <div class="list" id="roll-list">
        ${students.map((s) => rollRow(s, recordByStudent.get(s.id)?.status)).join("")}
      </div>
    </div>
    <div class="bottombar" id="bottombar"></div>
  `;

  function rollRow(s, status) {
    const isUnset = !status;
    return `
      <div class="roll-row ${isUnset ? "is-unset" : ""}" data-student="${s.id}">
        <div class="roll-name">${escapeHtml(s.name)}</div>
        <div class="roll-actions">
          ${STATUS_OPTIONS.map(
            (o) => `
            <button
              class="exc-btn ${status === o.status ? "active" : ""}"
              data-exc="${o.status}"
              data-student="${s.id}"
              title="${o.label}"
              aria-label="${o.label}"
            >
              ${icon(o.iconName, { size: 18 })}
              <span>${o.short}</span>
            </button>
          `
          ).join("")}
        </div>
      </div>
    `;
  }

  function missingCount() {
    let count = 0;
    for (const s of students) {
      if (!recordByStudent.get(s.id)?.status) count++;
    }
    return count;
  }

  function updateCounterBar() {
    const counts = { m: 0, w: 0, d: 0 };
    for (const s of students) {
      const status = recordByStudent.get(s.id)?.status;
      if (status && status !== "abwesend") counts[s.gender] = (counts[s.gender] || 0) + 1;
    }
    const bar = document.getElementById("counter-bar");
    bar.innerHTML = `
      <div class="counter-pill"><span class="sym">♂</span> ${counts.m || 0}</div>
      <div class="counter-pill"><span class="sym">♀</span> ${counts.w || 0}</div>
      ${counts.d ? `<div class="counter-pill"><span class="sym">⚧</span> ${counts.d}</div>` : ""}
    `;
  }

  function updateBottomBar() {
    const missing = missingCount();
    const bar = document.getElementById("bottombar");
    if (missing > 0) {
      bar.innerHTML = `
        <p class="muted" style="margin:0 0 0.5rem;text-align:center;">
          Noch ${missing} ${missing === 1 ? "Schüler:in ohne Status" : "Schüler:innen ohne Status"}
        </p>
        <button class="btn btn-primary btn-block btn-lg" disabled aria-disabled="true">Weiter zur Schwimmhalle</button>
      `;
    } else {
      bar.innerHTML = `
        <a class="btn btn-primary btn-block btn-lg" href="#/session/${sessionId}/pool">Weiter zur Schwimmhalle</a>
      `;
    }
  }

  document.getElementById("roll-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".exc-btn");
    if (!btn) return;
    const studentId = btn.getAttribute("data-student");
    const newStatus = btn.getAttribute("data-exc");
    if (btn.classList.contains("active")) return;
    const row = btn.closest(".roll-row");

    // Update immediately so tapping through a long roster feels instant; the
    // write to IndexedDB happens in the background (still ordered correctly).
    row.querySelectorAll(".exc-btn").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-exc") === newStatus);
    });
    row.classList.remove("is-unset");
    recordByStudent.set(studentId, { ...(recordByStudent.get(studentId) || {}), status: newStatus });
    updateCounterBar();
    updateBottomBar();

    db.upsertRecord(sessionId, studentId, { status: newStatus }).then((record) => {
      recordByStudent.set(studentId, record);
    });
  });

  updateCounterBar();
  updateBottomBar();
}
