import * as db from "../db.js";
import { topbar, escapeHtml, toast, GENDER_LABEL, GENDER_SYMBOL } from "../ui.js";
import { parseCSV, toCSV, downloadTextFile } from "../csv.js";
import { icon } from "../icons.js";

function normalizeGender(raw) {
  const v = (raw || "").trim().toLowerCase();
  if (["m", "j", "junge", "jungen", "male", "männlich", "maennlich", "boy"].includes(v)) return "m";
  if (["w", "f", "mädchen", "maedchen", "female", "weiblich", "girl"].includes(v)) return "w";
  if (v) return "d";
  return "m";
}

function rowsToStudents(rows) {
  return rows
    .map((row) => {
      const name =
        row.name || row.schüler || row.schueler || row.schülerin || row.vorname || Object.values(row)[0] || "";
      const genderRaw = row.geschlecht || row.gender || row["m/w"] || "";
      return { name: name.trim(), gender: normalizeGender(genderRaw) };
    })
    .filter((s) => s.name.length > 0);
}

export async function renderRoster(app, courseId) {
  const course = await db.getCourse(courseId);
  if (!course) {
    app.innerHTML = `<div class="container"><div class="card">Kurs nicht gefunden. <a href="#/">Zurück</a></div></div>`;
    return;
  }

  async function refreshList() {
    const students = await db.getStudentsByCourse(courseId);
    const listEl = document.getElementById("student-list");
    listEl.innerHTML =
      students.length === 0
        ? `<div class="empty-state">${icon("users", { size: 40, className: "big-emoji-icon" })}Noch keine Schüler:innen. Importiere eine Datei oder füge einzeln hinzu.</div>`
        : students.map(studentRow).join("");
    listEl.querySelectorAll("[data-toggle-gender]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-toggle-gender");
        const order = ["m", "w", "d"];
        const current = btn.getAttribute("data-gender");
        const next = order[(order.indexOf(current) + 1) % order.length];
        await db.updateStudent(id, { gender: next });
        refreshList();
      });
    });
    listEl.querySelectorAll("[data-delete-student]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete-student");
        const name = btn.getAttribute("data-name");
        if (!confirm(`„${name}“ inkl. aller erfassten Werte wirklich entfernen?`)) return;
        await db.deleteStudent(id);
        refreshList();
      });
    });
  }

  function studentRow(s) {
    return `
      <div class="list-item">
        <button class="icon-btn" data-toggle-gender="${s.id}" data-gender="${s.gender}" aria-label="Geschlecht ändern" title="Antippen zum Ändern">
          ${GENDER_SYMBOL[s.gender]}
        </button>
        <span class="title">${escapeHtml(s.name)}</span>
        <span class="muted" style="font-size:0.85rem;">${GENDER_LABEL[s.gender]}</span>
        <button class="icon-btn" data-delete-student="${s.id}" data-name="${escapeHtml(s.name)}" aria-label="Entfernen">${icon("trash", { size: 18 })}</button>
      </div>
    `;
  }

  app.innerHTML = `
    ${topbar({ title: `Schülerliste – ${escapeHtml(course.name)}`, back: `#/course/${courseId}` })}
    <div class="container">
      <div class="card">
        <h2>Aus Datei importieren</h2>
        <p class="muted">CSV-Datei mit Spalten <code>name</code> und optional <code>geschlecht</code> (m/w). Fehlt die Spalte, wird die erste Spalte als Name verwendet.</p>
        <div class="row">
          <label class="btn btn-primary btn-block" for="csv-file" style="cursor:pointer;">${icon("fileUp", { size: 18 })} Datei wählen</label>
          <button class="btn" id="download-template">${icon("download", { size: 18 })} Vorlage</button>
        </div>
        <input type="file" id="csv-file" accept=".csv,text/csv" style="display:none;" />
      </div>

      <div class="card">
        <h2>Einzeln hinzufügen</h2>
        <div class="field">
          <label for="new-name">Name</label>
          <input type="text" id="new-name" placeholder="Vor- und Nachname" />
        </div>
        <div class="field">
          <label for="new-gender">Geschlecht</label>
          <select id="new-gender">
            <option value="m">Junge</option>
            <option value="w">Mädchen</option>
            <option value="d">divers</option>
          </select>
        </div>
        <button class="btn btn-primary btn-block" id="add-student">Hinzufügen</button>
      </div>

      <div class="section-title">Schüler:innen</div>
      <div class="list" id="student-list"></div>
    </div>
  `;

  await refreshList();

  document.getElementById("download-template").addEventListener("click", () => {
    downloadTextFile(
      "schuelerliste-vorlage.csv",
      toCSV(
        [
          { name: "Maxi Mustermann", geschlecht: "m" },
          { name: "Alex Beispiel", geschlecht: "w" },
        ],
        ["name", "geschlecht"]
      )
    );
  });

  document.getElementById("csv-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    const students = rowsToStudents(rows);
    if (students.length === 0) {
      toast("Keine gültigen Zeilen gefunden");
      return;
    }
    await db.addStudents(courseId, students);
    toast(`${students.length} Schüler:in${students.length === 1 ? "" : "nen"} importiert`);
    e.target.value = "";
    await refreshList();
  });

  document.getElementById("add-student").addEventListener("click", async () => {
    const nameInput = document.getElementById("new-name");
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    const gender = document.getElementById("new-gender").value;
    await db.addStudent(courseId, name, gender);
    nameInput.value = "";
    nameInput.focus();
    await refreshList();
  });

  document.getElementById("new-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("add-student").click();
  });
}
