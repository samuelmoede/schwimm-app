import * as db from "../db.js";
import { topbar, toast } from "../ui.js";
import { downloadTextFile } from "../csv.js";

export async function renderBackup(app) {
  const courses = await db.getCourses();

  app.innerHTML = `
    ${topbar({ title: "Sicherung", back: "#/" })}
    <div class="container">
      <div class="privacy-note">
        🔒 Die Sicherungsdatei enthält alle Kursdaten (inkl. Schülernamen und Werte) im Klartext. Bewahre sie an
        einem sicheren Ort auf.
      </div>

      <div class="card">
        <h2>Sicherung erstellen</h2>
        <p class="muted">${courses.length} Kurs${courses.length === 1 ? "" : "e"} auf diesem Gerät. Lade regelmäßig eine Sicherung herunter, damit bei einem Gerätewechsel oder gelöschten Browserdaten nichts verloren geht.</p>
        <button class="btn btn-primary btn-block" id="export-backup">⬇️ Sicherung herunterladen (JSON)</button>
      </div>

      <div class="card">
        <h2>Sicherung wiederherstellen</h2>
        <p class="muted">⚠️ Dadurch werden <strong>alle</strong> aktuell auf diesem Gerät gespeicherten Kurse ersetzt.</p>
        <label class="btn btn-block" for="import-file" style="cursor:pointer;">📂 Sicherungsdatei wählen</label>
        <input type="file" id="import-file" accept="application/json,.json" style="display:none;" />
      </div>
    </div>
  `;

  document.getElementById("export-backup").addEventListener("click", async () => {
    const data = await db.exportAll();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`schwimmunterricht_sicherung_${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
    toast("Sicherung wird heruntergeladen");
  });

  document.getElementById("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const count = (data.courses || []).length;
      if (!confirm(`${count} Kurs${count === 1 ? "" : "e"} aus der Sicherung wiederherstellen? Alle aktuellen Daten auf diesem Gerät werden ersetzt.`)) {
        e.target.value = "";
        return;
      }
      await db.importAll(data);
      toast("Sicherung wiederhergestellt");
      location.hash = "#/";
    } catch (err) {
      alert("Diese Datei konnte nicht gelesen werden: " + err.message);
    } finally {
      e.target.value = "";
    }
  });
}
