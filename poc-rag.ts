import * as lancedb from "@lancedb/lancedb";

// --- STEP 1: Fake notes (stand-ins for real Joplin notes) ---
const notes = [
  {
    id: "note_1",
    title: "Meeting notes Jan",
    body: "Discussed Q1 budget with Sarah. Decided to cut travel costs by 20%.",
  },
  {
    id: "note_2",
    title: "RAG paper summary",
    body: "Retrieval-Augmented Generation combines dense retrieval with seq2seq generation.",
  },
  {
    id: "note_3",
    title: "Grocery list",
    body: "Buy milk, eggs, bread, and coffee beans from the store.",
  },
];

// --- STEP 2: embed() — converts text to a number array using Ollama ---
async function embed(text: string): Promise<number[]> {
  const res = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
  });
  const data = await res.json();
  return data.embedding;
}

// --- STEP 3: buildIndex() — saves all notes + embeddings into LanceDB ---
async function buildIndex() {
  const db = await lancedb.connect("./poc-db");
  const rows = [];

  for (const note of notes) {
    console.log(`Embedding note: ${note.title}...`);
    const vector = await embed(note.title + " " + note.body);
    rows.push({ id: note.id, title: note.title, body: note.body, vector });
  }

  await db.createTable("notes", rows, { mode: "overwrite" });
  console.log(`\nIndexed ${rows.length} notes successfully.\n`);
  return db;
}

// --- STEP 4: query() — finds most relevant notes for a question ---
async function query(db: lancedb.Connection, question: string) {
  const table = await db.openTable("notes");
  const queryVec = await embed(question);
  const results = await table.search(queryVec).limit(2).toArray();

  console.log(`Top results for: "${question}"`);
  results.forEach((r, i) => {
    console.log(`  [${i + 1}] ${r.title}: ${r.body}`);
  });

  return results;
}

// --- STEP 5: answer() — sends notes + question to llama3, prints answer ---
async function answer(context: string, question: string) {
  console.log("\nAsking llama3...\n");
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3",
      prompt: `Answer using ONLY the notes below. Do not use outside knowledge.\n\nNotes:\n${context}\n\nQuestion: ${question}`,
      stream: false,
    }),
  });
  const data = await res.json();
  console.log("Answer:", data.response);
}

// --- RUN EVERYTHING ---
(async () => {
  const db = await buildIndex();

  const question = "what did we decide about the budget?";
  const chunks = await query(db, question);

  const context = chunks
    .map((c) => `[${c.title}]: ${c.body}`)
    .join("\n");

  await answer(context, question);
})();