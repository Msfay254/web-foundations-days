// Notes Toolkit - Day 3

let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const ALLOWED_CATEGORIES = ["personal", "work", "study"];
const MAX_LENGTH = 200;

// Lower-case, trim and collapse repeated spaces so comparisons are fair.
function normalise(text) {
  return String(text).trim().replace(/\s+/g, " ").toLowerCase();
}

// 1. Notes whose text contains the word, ignoring case.
function searchNotes(word) {
  const target = String(word).trim().toLowerCase();
  if (target === "") {
    return [];
  }
  return notes.filter(function (note) {
    return note.text.toLowerCase().includes(target);
  });
}

// 2. The note with the most characters, or null if there are none.
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// 3. Count of notes per category, e.g. { personal: 2, study: 2, work: 1 }.
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category] === undefined) {
      counts[note.category] = 0;
    }
    counts[note.category]++;
  }
  return counts;
}

// 4. A sentence such as "5 notes: 2 personal, 1 work, 2 study."
function getSummary() {
  const total = notes.length;
  const word = total === 1 ? "note" : "notes";
  if (total === 0) {
    return "0 notes.";
  }
  const counts = countByCategory();
  const parts = [];
  for (const category of ALLOWED_CATEGORIES) {
    if (counts[category]) {
      parts.push(`${counts[category]} ${category}`);
    }
  }
  return `${total} ${word}: ${parts.join(", ")}.`;
}

// 5. True if a note with the same text exists (ignoring case and extra spaces).
function isDuplicate(text) {
  const target = normalise(text);
  return notes.some(function (note) {
    return normalise(note.text) === target;
  });
}

// 6. Add a note if valid. Returns true when added, false otherwise.
function addNote(text, category) {
  if (typeof text !== "string") {
    console.log("Not added: text must be a string.");
    return false;
  }
  const cleaned = text.trim();
  if (cleaned.length < 1 || cleaned.length > MAX_LENGTH) {
    console.log(`Not added: text must be 1-${MAX_LENGTH} characters.`);
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log("Not added: a note with this text already exists.");
    return false;
  }
  if (!ALLOWED_CATEGORIES.includes(category)) {
    console.log("Not added: category must be personal, work or study.");
    return false;
  }
  const nextId = notes.reduce((max, n) => Math.max(max, n.id), 0) + 1;
  notes.push({ id: nextId, text: cleaned, category: category });
  return true;
}

// ---------------- Tests ----------------

// searchNotes
console.log(searchNotes("MILK"));
// [ { id: 1, text: "Buy milk and bread", category: "personal" } ]
console.log(searchNotes("xyz"));
// [] (edge case: no results)

// longestNote
console.log(longestNote());
// { id: 3, text: "Email the project report to Grace", category: "work" }
const savedNotes = notes;
notes = [];
console.log(longestNote());
// null (edge case: no notes)
notes = savedNotes;

// countByCategory
console.log(countByCategory());
// { personal: 2, study: 2, work: 1 }
notes = [];
console.log(countByCategory());
// {} (edge case: no notes)
notes = savedNotes;

// getSummary
console.log(getSummary());
// "5 notes: 2 personal, 1 work, 2 study."
notes = [{ id: 1, text: "Only one", category: "work" }];
console.log(getSummary());
// "1 note: 1 work." (edge case: singular)
notes = savedNotes;

// isDuplicate
console.log(isDuplicate("  buy MILK   and bread "));
// true (ignores case and extra spaces)
console.log(isDuplicate("Buy eggs"));
// false

// addNote
console.log(addNote("Plan weekend trip", "personal"));
// true
console.log(addNote("buy milk and bread", "personal"));
// logs "Not added: a note with this text already exists." then false
console.log(addNote("", "work"));
// logs "Not added: text must be 1-200 characters." then false
console.log(addNote("x".repeat(201), "work"));
// logs "Not added: text must be 1-200 characters." then false
console.log(addNote("Read chapter 4", "hobby"));
// logs "Not added: category must be personal, work or study." then false
console.log(getSummary());
// "6 notes: 3 personal, 1 work, 2 study." (confirms only one note was added)