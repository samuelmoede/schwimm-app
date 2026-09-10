import * as db from "../db.js";
import { topbar, escapeHtml, formatDate, STATUS_META } from "../ui.js";
import { icon } from "../icons.js";

const DISCIPLINES = [
  { key: "wagnissprung", short: "Wagnis", label: "Wagnissprung", placeholder: "z. B. bestanden" },
  { key: "tauchen", short: "Tauchen", label: "Tauchen (Distanz)", placeholder: "Meter, z. B. 10" },
  { key: "ausdauer", short: "Ausdauer", label: "Ausdauerschwimmen", placeholder: "z. B. 20 Min / 800 m" },
  { key: "brust", short: "Brust", label: "Brust (Zeit)", placeholder: "mm:ss" },
  { key: "kraul", short: "Kraul", label: "Kraul (Zeit)", placeholder: "mm:ss" },
  { key: "ruecken", short: "Rücken", label: "Rücken (Zeit)", placeholder: "mm:ss" },
];
const DISCIPLINE_BY_KEY = Object.fromEntries(DISCIPLINES.map((d) => [d.key, d]));

const LONG_PRESS_MS = 500;

// Surname-ish sort key: last "word" of the name, since students are stored
// as one free-text name (usually "Vorname Nachname").
function surnameKey(name) {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[parts.length - 1] : name).toLowerCase();
}

// Every boy across all courses - not just this session's course - since one
// teacher can be responsible for all boys at the pool while other teachers
// cover the rest of each class.
async function loadBoysAcrossCourses() {
  const courses = await db.getCourses();
  const perCourse = await Promise.all(courses.map((c) => db.getStudentsByCourse(c.id)));
  const boys = [];
  courses.forEach((c, i) => {
    for (const s of perCourse[i]) {
      if (s.gender === "m") boys.push({ ...s, courseName: c.name });
    }
  });
  boys.sort((a, b) => {
    return (
      a.courseName.localeCompare(b.courseName, "de") ||
      surnameKey(a.name).localeCompare(surnameKey(b.name), "de") ||
      a.name.localeCompare(b.name, "de")
    );
  });
  return boys;
}

export async function renderPool(app, sessionId) {
  const session = await db.getSession(sessionId);
  if (!session) {
    app.innerHTML = `<div class="container"><div class="card">Termin nicht gefunden. <a href="#/">Zurück</a></div></div>`;
    return;
  }
  const course = await db.getCourse(session.courseId);
  const students = await loadBoysAcrossCourses();
  const records = await db.getRecordsBySession(sessionId);
  const recordByStudent = new Map(records.map((r) => [r.studentId, r]));

  // Boys default to "anwesend" (present) unless marked otherwise here or
  // during the home class's own departure roll call.
  const groups = { active: [], comment: [], absent: [] };
  for (const s of students) {
    const status = recordByStudent.get(s.id)?.status;
    if (status === "abwesend") groups.absent.push(s);
    else if (status === "vergessen" || status === "unfaehig") groups.comment.push(s);
    else groups.active.push(s);
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

      <div class="section-title">Jungen – Disziplinen (${groups.active.length} anwesend${
    groups.absent.length ? `, ${groups.absent.length} abwesend` : ""
  })</div>
      ${
        groups.active.length === 0 && groups.absent.length === 0
          ? `<div class="empty-state muted">Keine Jungen gefunden. Lege Klassen mit Schüler:innen an.</div>`
          : `<p class="muted" style="margin-top:-0.4rem;">Zelle antippen zum Eintragen. Name gedrückt halten, um den Status zu ändern. „–“ = noch offen.</p>
             <div class="discipline-table-wrap">
               <table class="discipline-table">
                 <thead>
                   <tr>
                     <th class="sticky-col">Name</th>
                     ${DISCIPLINES.map((d) => `<th>${d.short}</th>`).join("")}
                   </tr>
                 </thead>
                 <tbody>
                   ${groups.active.map((s) => studentRow(s, false)).join("")}
                   ${groups.absent.map((s) => studentRow(s, true)).join("")}
                 </tbody>
               </table>
             </div>`
      }

      <div class="section-title">Nicht schwimmfähig – Kommentar (${groups.comment.length})</div>
      ${
        groups.comment.length === 0
          ? `<div class="empty-state muted">Niemand in dieser Kategorie.</div>`
          : groups.comment.map(commentCard).join("")
      }
    </div>

    <div class="modal-overlay" id="value-modal" hidden>
      <div class="modal-card">
        <h3 id="modal-title"></h3>
        <div class="field">
          <input type="text" inputmode="decimal" id="modal-input" />
          <p class="hint" id="modal-hint"></p>
        </div>
        <div class="row">
          <button class="btn btn-danger" id="modal-clear">Löschen</button>
          <button class="btn btn-primary" id="modal-save">Speichern</button>
        </div>
        <button class="btn btn-block" id="modal-cancel" style="margin-top:0.5rem;">Abbrechen</button>
      </div>
    </div>

    <div class="modal-overlay" id="status-modal" hidden>
      <div class="modal-card">
        <h3 id="status-modal-title">Status ändern</h3>
        <div class="status-options" id="status-options">
          ${Object.entries(STATUS_META)
            .map(
              ([key, meta]) => `
              <button class="status-pick-btn" data-status="${key}" data-tag="${meta.tag}">
                ${icon(meta.icon, { size: 18 })} ${meta.label}
              </button>
            `
            )
            .join("")}
        </div>
        <button class="btn btn-block" id="status-modal-cancel">Abbrechen</button>
      </div>
    </div>
  `;

  function studentRow(s, isAbsent) {
    const record = recordByStudent.get(s.id);
    const values = record?.disciplines || {};
    return `
      <tr class="${isAbsent ? "row-absent" : ""}">
        <td class="sticky-col name-cell" data-name-cell="${s.id}">
          <div>${escapeHtml(s.name)} <span class="muted small">(${escapeHtml(s.courseName)})</span></div>
          ${isAbsent ? `<div class="muted" style="font-size:0.68rem;">abwesend – antippen für „anwesend“</div>` : ""}
        </td>
        ${DISCIPLINES.map((d) => {
          const val = values[d.key];
          return `<td><button class="cell-btn ${val ? "filled" : "empty"}" data-student="${s.id}" data-discipline="${d.key}">${
            val ? escapeHtml(val) : "–"
          }</button></td>`;
        }).join("")}
      </tr>
    `;
  }

  function commentCard(s) {
    const record = recordByStudent.get(s.id);
    const status = record?.status;
    return `
      <div class="student-card">
        <div class="name-row" data-name-cell="${s.id}">
          ${escapeHtml(s.name)} <span class="muted small">(${escapeHtml(s.courseName)})</span>
          <span class="tag ${STATUS_META[status].tag}">${icon(STATUS_META[status].icon, { size: 14 })} ${STATUS_META[status].label}</span>
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

  app.querySelectorAll("textarea[id^='c-']").forEach((textarea) => {
    textarea.addEventListener("change", async (e) => {
      const studentId = e.target.getAttribute("data-student");
      await db.upsertRecord(sessionId, studentId, { comment: e.target.value });
    });
  });

  // Tap-to-edit modal for discipline cells - keeps the table compact while
  // still giving a comfortably sized input when entering a value.
  const modal = document.getElementById("value-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalHint = document.getElementById("modal-hint");
  const modalInput = document.getElementById("modal-input");
  let editing = null; // { studentId, key, btn }

  function openModal(btn) {
    const studentId = btn.getAttribute("data-student");
    const key = btn.getAttribute("data-discipline");
    const s = students.find((st) => st.id === studentId);
    const d = DISCIPLINE_BY_KEY[key];
    const record = recordByStudent.get(studentId);
    editing = { studentId, key, btn };
    modalTitle.textContent = `${s.name} – ${d.label}`;
    modalHint.textContent = d.placeholder;
    modalInput.placeholder = d.placeholder;
    modalInput.value = record?.disciplines?.[key] || "";
    modal.hidden = false;
    modalInput.focus();
  }

  function closeModal() {
    modal.hidden = true;
    editing = null;
  }

  function applyValue(value) {
    const { studentId, key, btn } = editing;
    btn.textContent = value || "–";
    btn.classList.toggle("filled", !!value);
    btn.classList.toggle("empty", !value);
    const record = { ...(recordByStudent.get(studentId) || { disciplines: {} }) };
    record.disciplines = { ...record.disciplines, [key]: value };
    recordByStudent.set(studentId, record);
    db.upsertRecord(sessionId, studentId, { disciplines: { [key]: value } });
    closeModal();
  }

  app.querySelectorAll(".cell-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.closest("tr").classList.contains("row-absent")) return;
      openModal(btn);
    });
  });

  document.getElementById("modal-save").addEventListener("click", () => applyValue(modalInput.value.trim()));
  document.getElementById("modal-clear").addEventListener("click", () => applyValue(""));
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  modalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyValue(modalInput.value.trim());
    if (e.key === "Escape") closeModal();
  });

  // Status modal: opened by long-pressing a student's name (see below).
  const statusModal = document.getElementById("status-modal");
  const statusModalTitle = document.getElementById("status-modal-title");
  let statusTarget = null;

  async function setStatus(studentId, status) {
    await db.upsertRecord(sessionId, studentId, { status });
    await renderPool(app, sessionId);
  }

  function openStatusModal(studentId) {
    statusTarget = studentId;
    const s = students.find((st) => st.id === studentId);
    statusModalTitle.textContent = `${s.name} (${s.courseName})`;
    statusModal.hidden = false;
  }

  function closeStatusModal() {
    statusModal.hidden = true;
    statusTarget = null;
  }

  document.getElementById("status-options").querySelectorAll("[data-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const status = btn.getAttribute("data-status");
      const studentId = statusTarget;
      closeStatusModal();
      setStatus(studentId, status);
    });
  });
  document.getElementById("status-modal-cancel").addEventListener("click", closeStatusModal);
  statusModal.addEventListener("click", (e) => {
    if (e.target === statusModal) closeStatusModal();
  });

  // Long-press a name to change status; a quick tap on an already-absent
  // row instantly restores "anwesend" instead of opening the full menu.
  app.querySelectorAll("[data-name-cell]").forEach((el) => {
    const studentId = el.getAttribute("data-name-cell");
    let timer = null;
    let firedLongPress = false;

    function start(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      firedLongPress = false;
      timer = setTimeout(() => {
        firedLongPress = true;
        openStatusModal(studentId);
      }, LONG_PRESS_MS);
    }
    function cancelTimer() {
      clearTimeout(timer);
    }
    function end() {
      clearTimeout(timer);
      if (firedLongPress) return;
      const status = recordByStudent.get(studentId)?.status;
      if (status === "abwesend") setStatus(studentId, "anwesend");
    }

    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointerleave", cancelTimer);
    el.addEventListener("pointercancel", cancelTimer);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  });
}
