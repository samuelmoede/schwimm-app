import * as db from "../db.js";
import { topbar, escapeHtml, toast } from "../ui.js";

export async function renderCourses(app) {
  const courses = await db.getCourses();

  app.innerHTML = `
    ${topbar({
      title: "Schwimmunterricht",
      actionsHtml: `<a class="icon-btn" href="#/backup" aria-label="Sicherung">💾</a>`,
    })}
    <div class="container">
      <div class="privacy-note">
        🔒 Alle Daten bleiben nur auf diesem Gerät – es gibt keine Cloud, keinen Server, keine Übertragung.
      </div>

      <div class="card" id="new-course-card" style="display:none; margin-top:1rem;">
        <h2>Neuer Kurs</h2>
        <div class="field">
          <label for="course-name">Name des Kurses</label>
          <input type="text" id="course-name" placeholder="z. B. Schwimmen 6b, Schuljahr 25/26" />
        </div>
        <div class="row">
          <button class="btn" id="cancel-course">Abbrechen</button>
          <button class="btn btn-primary" id="save-course">Anlegen</button>
        </div>
      </div>

      <div class="section-title" style="margin-top:1.5rem;">Deine Kurse</div>
      <div class="list" id="course-list">
        ${
          courses.length === 0
            ? `<div class="empty-state"><span class="big-emoji">🏊</span>Noch kein Kurs angelegt.<br />Tippe unten auf „+“, um zu starten.</div>`
            : courses.map((c) => courseRow(c)).join("")
        }
      </div>
    </div>
    <button class="fab" id="fab-new-course" aria-label="Neuer Kurs">+</button>
  `;

  function courseRow(c) {
    return `
      <a class="list-item" href="#/course/${c.id}">
        <span class="title">${escapeHtml(c.name)}</span>
        <span class="chevron">›</span>
      </a>
    `;
  }

  const newCourseCard = document.getElementById("new-course-card");
  const nameInput = document.getElementById("course-name");

  document.getElementById("fab-new-course").addEventListener("click", () => {
    newCourseCard.style.display = "block";
    newCourseCard.scrollIntoView({ behavior: "smooth", block: "start" });
    nameInput.focus();
  });

  document.getElementById("cancel-course").addEventListener("click", () => {
    newCourseCard.style.display = "none";
    nameInput.value = "";
  });

  document.getElementById("save-course").addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    const course = await db.addCourse(name);
    location.hash = `#/course/${course.id}`;
  });

  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("save-course").click();
  });
}
