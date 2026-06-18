import test from "node:test";
import assert from "node:assert/strict";

// Mirror page helpers — if these drift, extract to src/lib/estimate-editor-notes.js
function splitEstimateDocumentText(noteText) {
  const text = String(noteText || "").trim();
  if (!text) {
    return { workDescription: "", scopeOfWork: "", additionalNotes: "" };
  }

  const scopeMarker = "\n\nScope of work:\n";
  const notesMarker = "\n\nNotes:\n";
  const scopeIdx = text.indexOf(scopeMarker);
  const notesIdx = text.indexOf(notesMarker);

  if (scopeIdx === -1 && notesIdx === -1) {
    return { workDescription: text, scopeOfWork: "", additionalNotes: "" };
  }

  const workDescription = (
    scopeIdx >= 0 ? text.slice(0, scopeIdx) : notesIdx >= 0 ? text.slice(0, notesIdx) : text
  ).trim();

  let scopeOfWork = "";
  if (scopeIdx >= 0) {
    const scopeEnd = notesIdx > scopeIdx ? notesIdx : text.length;
    scopeOfWork = text.slice(scopeIdx + scopeMarker.length, scopeEnd).trim();
  }

  let additionalNotes = "";
  if (notesIdx >= 0) {
    additionalNotes = text.slice(notesIdx + notesMarker.length).trim();
  }

  return { workDescription, scopeOfWork, additionalNotes };
}

function joinEstimateDocumentText(workDescription, scopeOfWork, additionalNotes) {
  const parts = [];
  const work = String(workDescription || "").trim();
  const scope = String(scopeOfWork || "").trim();
  const notes = String(additionalNotes || "").trim();
  if (work) parts.push(work);
  if (scope) parts.push(`Scope of work:\n${scope}`);
  if (notes) parts.push(`Notes:\n${notes}`);
  return parts.join("\n\n");
}

test("split/join round-trips structured estimate notes", () => {
  const joined = joinEstimateDocumentText(
    "Kitchen remodel overview",
    "- Demo cabinets\n- Install quartz",
    "Customer prefers morning access",
  );
  const parsed = splitEstimateDocumentText(joined);
  assert.equal(parsed.workDescription, "Kitchen remodel overview");
  assert.match(parsed.scopeOfWork, /Demo cabinets/);
  assert.equal(parsed.additionalNotes, "Customer prefers morning access");
});

test("legacy plain notes stay in work description", () => {
  const legacy = "Single block scope from old editor";
  const parsed = splitEstimateDocumentText(legacy);
  assert.equal(parsed.workDescription, legacy);
  assert.equal(parsed.scopeOfWork, "");
  assert.equal(parsed.additionalNotes, "");
});

test("empty notes split cleanly", () => {
  const parsed = splitEstimateDocumentText("");
  assert.deepEqual(parsed, {
    workDescription: "",
    scopeOfWork: "",
    additionalNotes: "",
  });
});
