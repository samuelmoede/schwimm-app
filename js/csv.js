// Minimal CSV parsing/writing – no dependency needed, works fully offline.
// Auto-detects ',' vs ';' as the delimiter (German Excel exports use ';').

function detectDelimiter(firstLine) {
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  return semi > comma ? ";" : ",";
}

function parseLine(line, delim) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

// Returns an array of objects keyed by the header row. Blank lines are skipped.
export function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const delim = detectDelimiter(lines[0]);
  const headers = parseLine(lines[0], delim).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = parseLine(line, delim);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (values[i] || "").trim()));
    return obj;
  });
}

function escapeField(value, delim) {
  const s = String(value ?? "");
  if (s.includes(delim) || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCSV(rows, headers, delim = ";") {
  const lines = [headers.join(delim)];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeField(row[h], delim)).join(delim));
  }
  return lines.join("\r\n");
}

// Older German school-admin exports (e.g. Schulportal) are often saved as
// Windows-1252, not UTF-8. Detect invalid UTF-8 and fall back so umlauts
// (ä/ö/ü/ß) in names don't get mangled.
export async function readTextSmart(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export function downloadTextFile(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
