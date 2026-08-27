// Local-only IndexedDB data layer for the swim tracker.
// Nothing in this file ever makes a network request - all data stays on the device.

const DB_NAME = "swimtracker";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      const courses = db.createObjectStore("courses", { keyPath: "id" });
      courses.createIndex("createdAt", "createdAt");

      const students = db.createObjectStore("students", { keyPath: "id" });
      students.createIndex("courseId", "courseId");

      const sessions = db.createObjectStore("sessions", { keyPath: "id" });
      sessions.createIndex("courseId", "courseId");
      sessions.createIndex("date", "date");

      const records = db.createObjectStore("records", { keyPath: "id" });
      records.createIndex("sessionId", "sessionId");
      records.createIndex("studentId", "studentId");
      records.createIndex("sessionId_studentId", ["sessionId", "studentId"], { unique: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function tx(storeNames, mode, fn) {
  return getDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeNames, mode);
        let result;
        Promise.resolve(fn(t))
          .then((r) => (result = r))
          .catch((err) => {
            try {
              t.abort();
            } catch (_) {}
            reject(err);
          });
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error("Transaction aborted"));
      })
  );
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function getAllByIndex(store, indexName, value) {
  return reqToPromise(store.index(indexName).getAll(value));
}

// ---------- Courses ----------

export function addCourse(name) {
  const course = { id: uid(), name: name.trim(), createdAt: new Date().toISOString() };
  return tx(["courses"], "readwrite", (t) => reqToPromise(t.objectStore("courses").add(course))).then(() => course);
}

export function getCourses() {
  return tx(["courses"], "readonly", (t) => reqToPromise(t.objectStore("courses").getAll())).then((list) =>
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  );
}

export function getCourse(id) {
  return tx(["courses"], "readonly", (t) => reqToPromise(t.objectStore("courses").get(id)));
}

export function updateCourse(id, patch) {
  return tx(["courses"], "readwrite", async (t) => {
    const store = t.objectStore("courses");
    const course = await reqToPromise(store.get(id));
    if (!course) throw new Error("Kurs nicht gefunden");
    Object.assign(course, patch);
    await reqToPromise(store.put(course));
    return course;
  });
}

export function deleteCourse(id) {
  return tx(["courses", "students", "sessions", "records"], "readwrite", async (t) => {
    const students = await getAllByIndex(t.objectStore("students"), "courseId", id);
    const sessions = await getAllByIndex(t.objectStore("sessions"), "courseId", id);
    for (const s of students) await reqToPromise(t.objectStore("students").delete(s.id));
    for (const s of sessions) {
      const records = await getAllByIndex(t.objectStore("records"), "sessionId", s.id);
      for (const r of records) await reqToPromise(t.objectStore("records").delete(r.id));
      await reqToPromise(t.objectStore("sessions").delete(s.id));
    }
    await reqToPromise(t.objectStore("courses").delete(id));
  });
}

// ---------- Students ----------

export function addStudents(courseId, students) {
  // students: [{ name, gender }]
  return tx(["students"], "readwrite", async (t) => {
    const store = t.objectStore("students");
    const created = [];
    for (const s of students) {
      const student = { id: uid(), courseId, name: s.name.trim(), gender: s.gender || "m" };
      await reqToPromise(store.add(student));
      created.push(student);
    }
    return created;
  });
}

export function addStudent(courseId, name, gender) {
  return addStudents(courseId, [{ name, gender }]).then((list) => list[0]);
}

export function getStudentsByCourse(courseId) {
  return tx(["students"], "readonly", (t) => getAllByIndex(t.objectStore("students"), "courseId", courseId)).then(
    (list) => list.sort((a, b) => a.name.localeCompare(b.name, "de"))
  );
}

export function updateStudent(id, patch) {
  return tx(["students"], "readwrite", async (t) => {
    const store = t.objectStore("students");
    const student = await reqToPromise(store.get(id));
    if (!student) throw new Error("Schüler:in nicht gefunden");
    Object.assign(student, patch);
    await reqToPromise(store.put(student));
    return student;
  });
}

export function deleteStudent(id) {
  return tx(["students", "records"], "readwrite", async (t) => {
    const records = await getAllByIndex(t.objectStore("records"), "studentId", id);
    for (const r of records) await reqToPromise(t.objectStore("records").delete(r.id));
    await reqToPromise(t.objectStore("students").delete(id));
  });
}

// ---------- Sessions ----------

export function addSession(courseId, date, note = "") {
  const session = { id: uid(), courseId, date, note, createdAt: new Date().toISOString() };
  return tx(["sessions"], "readwrite", (t) => reqToPromise(t.objectStore("sessions").add(session))).then(
    () => session
  );
}

export function getSessionsByCourse(courseId) {
  return tx(["sessions"], "readonly", (t) => getAllByIndex(t.objectStore("sessions"), "courseId", courseId)).then(
    (list) => list.sort((a, b) => b.date.localeCompare(a.date))
  );
}

export function getSession(id) {
  return tx(["sessions"], "readonly", (t) => reqToPromise(t.objectStore("sessions").get(id)));
}

export function updateSession(id, patch) {
  return tx(["sessions"], "readwrite", async (t) => {
    const store = t.objectStore("sessions");
    const session = await reqToPromise(store.get(id));
    if (!session) throw new Error("Termin nicht gefunden");
    Object.assign(session, patch);
    await reqToPromise(store.put(session));
    return session;
  });
}

export function deleteSession(id) {
  return tx(["sessions", "records"], "readwrite", async (t) => {
    const records = await getAllByIndex(t.objectStore("records"), "sessionId", id);
    for (const r of records) await reqToPromise(t.objectStore("records").delete(r.id));
    await reqToPromise(t.objectStore("sessions").delete(id));
  });
}

// ---------- Records ----------

export function getRecordsBySession(sessionId) {
  return tx(["records"], "readonly", (t) => getAllByIndex(t.objectStore("records"), "sessionId", sessionId));
}

export function getRecord(sessionId, studentId) {
  return tx(["records"], "readonly", (t) =>
    reqToPromise(t.objectStore("records").index("sessionId_studentId").get([sessionId, studentId]))
  );
}

// Create-or-update the record for one student in one session.
export function upsertRecord(sessionId, studentId, patch) {
  return tx(["records"], "readwrite", async (t) => {
    const store = t.objectStore("records");
    const existing = await reqToPromise(store.index("sessionId_studentId").get([sessionId, studentId]));
    const base = existing || {
      id: uid(),
      sessionId,
      studentId,
      status: null,
      comment: "",
      disciplines: {},
    };
    const record = { ...base, ...patch };
    if (patch.disciplines) {
      record.disciplines = { ...base.disciplines, ...patch.disciplines };
    }
    await reqToPromise(store.put(record));
    return record;
  });
}

// ---------- Backup / restore ----------

export async function exportAll() {
  return tx(["courses", "students", "sessions", "records"], "readonly", async (t) => ({
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    courses: await reqToPromise(t.objectStore("courses").getAll()),
    students: await reqToPromise(t.objectStore("students").getAll()),
    sessions: await reqToPromise(t.objectStore("sessions").getAll()),
    records: await reqToPromise(t.objectStore("records").getAll()),
  }));
}

// Replaces ALL local data with the contents of a previously exported backup.
export async function importAll(data) {
  if (!data || !Array.isArray(data.courses)) throw new Error("Ungültige Sicherungsdatei");
  return tx(["courses", "students", "sessions", "records"], "readwrite", async (t) => {
    for (const name of ["courses", "students", "sessions", "records"]) {
      const store = t.objectStore(name);
      await reqToPromise(store.clear());
      for (const item of data[name] || []) {
        await reqToPromise(store.add(item));
      }
    }
  });
}
