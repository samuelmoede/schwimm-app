import * as db from "../db.js";
import { topbar, escapeHtml, formatDate, STATUS_META, GENDER_SYMBOL } from "../ui.js";
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

  // Students default to "anwesend" (present) unless marked otherwise in attendance.
  const groups = { anwesend: [], comment: [], abwesend: [] };
  for (const s of students) {
    const status = recordByStudent.get(s.id)?.status;
    if (status === "abwesend") groups.abwesend.push(s);
    else if (status === "vergessen" || status === "unfaehig") groups.comment.push(s);
    else groups.anwesend.push(s);
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

      <div class="section-title">Aktiv – Disziplinen (${groups.anwesend.length})</div>
      ${
        groups.anwesend.length === 0
          ? `<div class="empty-state muted">Niemand als „anwesend“ markiert.</div>`
          : `<p class="muted" style="margin-top:-0.4rem;">Zelle antippen zum Eintragen. „–“ = noch offen.</p>
             <div class="discipline-table-wrap">
               <table class="discipline-table">
                 <thead>
                   <tr>
                     <th class="sticky-col">Name</th>
                     ${DISCIPLINES.map((d) => `<th>${d.short}</th>`).join("")}
                   </tr>
                 </thead>
                 <tbody>${groups.anwesend.map(studentRow).join("")}</tbody>
               </table>
             </div>`
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
  `;

  function studentRow(s) {
    const record = recordByStudent.get(s.id);
    const values = record?.disciplines || {};
    return `
      <tr>
        <td class="sticky-col">${GENDER_SYMBOL[s.gender]} ${escapeHtml(s.name)}</td>
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
        <div class="name-row">
          ${GENDER_SYMBOL[s.gender]} ${escapeHtml(s.name)}
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
  let editing = null; // { studentId, key, name, btn }

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
    btn.addEventListener("click", () => openModal(btn));
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
}
