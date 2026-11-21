"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import Tesseract from "tesseract.js";
import { supabase, supabaseConfigured } from "@/lib/supabase";

type Question = {
  id: string;
  question_text: string;
  question_type: string | null;
  options: string[] | null;
  answer: string | null;
  chapter: string | null;
  marks: number | null;
  created_at: string;
};

function detectType(text: string): string {
  if (/assertion\s*[:\-]/i.test(text) && /reason\s*[:\-]/i.test(text)) return "Assertion–Reason";
  if (/(^|\n)\s*[A-D][.)]\s+/m.test(text) || /which of the following|choose the correct option/i.test(text)) return "MCQ";
  return "Descriptive";
}

function extractOptions(text: string): string[] | null {
  const found = [...text.matchAll(/(?:^|\n)\s*([A-D])[.)]\s*(.+)/g)];
  return found.length >= 2 ? found.map((m) => `${m[1]}. ${m[2].trim()}`) : null;
}

function splitIntoQuestions(text: string): string[] {
  const normalized = text.replace(/\r/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!normalized) return [];
  const numbered = normalized
    .split(/(?=(?:^|\n)\s*(?:Q(?:uestion)?\s*)?\d{1,3}\s*[.)])/im)
    .map((part) => part.trim())
    .filter(Boolean);
  if (numbered.length > 1) return numbered;
  return normalized.split(/\n{2,}/).map((part) => part.trim()).filter((part) => part.length > 15);
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfData = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
  let text = "";
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: unknown) => {
        if (typeof item === "object" && item !== null && "str" in item) {
          return String((item as { str: string }).str);
        }
        return "";
      })
      .join(" ");
    text += pageText + "\n\n";
  }
  return text;
}

async function extractImageText(file: File): Promise<string> {
  const result = await Tesseract.recognize(file, "eng");
  return result.data.text;
}

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [chapterInput, setChapterInput] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user?.id) void loadQuestions();
  }, [session?.user?.id]);

  async function loadQuestions() {
    if (!supabase) return;
    const { data, error: loadError } = await supabase
      .from("questions")
      .select("*")
      .order("created_at", { ascending: false });
    if (loadError) setError(loadError.message);
    else setQuestions((data ?? []) as Question[]);
  }

  async function signIn() {
    if (!supabase) return;
    setError("");
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (signInError) setError(signInError.message);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setQuestions([]);
  }

  async function processFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || !supabase || !session?.user) return;

    setBusy(true);
    setError("");
    let added = 0;
    let duplicates = 0;
    let unreadable = 0;

    try {
      for (const file of Array.from(files)) {
        setStatus(`Uploading ${file.name}…`);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${session.user.id}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("question-bank-files")
          .upload(storagePath, file);
        if (uploadError) throw uploadError;

        setStatus(`Extracting text from ${file.name}…`);
        let extracted = "";
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          extracted = await extractPdfText(file);
        } else if (file.type.startsWith("image/")) {
          extracted = await extractImageText(file);
        }

        if (!extracted.trim()) {
          unreadable++;
          continue;
        }

        const chunks = splitIntoQuestions(extracted);
        for (const chunk of chunks) {
          const cleanText = chunk.replace(/\s+/g, " ").trim();
          if (cleanText.length < 12) continue;
          const normalized = cleanText.toLowerCase().replace(/[^a-z0-9]/g, "");
          const alreadyExists = questions.some(
            (question) => question.question_text.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized
          );
          if (alreadyExists) {
            duplicates++;
            continue;
          }

          const { error: insertError } = await supabase.from("questions").insert({
            user_id: session.user.id,
            question_text: cleanText,
            question_type: detectType(cleanText),
            options: extractOptions(chunk),
            chapter: chapterInput.trim() || null,
          });
          if (insertError) throw insertError;
          added++;
        }
      }
      setStatus(`Complete: ${added} added, ${duplicates} exact duplicates skipped, ${unreadable} files with no extractable text.`);
      await loadQuestions();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "An unexpected upload error occurred.";
      setError(message);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  const filtered = useMemo(
    () => questions.filter((q) => !search || q.question_text.toLowerCase().includes(search.toLowerCase())),
    [questions, search]
  );

  function exportPdf() {
    const doc = new jsPDF();
    let y = 18;
    doc.setFontSize(18);
    doc.text("Question Bank AI", 14, y);
    y += 12;
    doc.setFontSize(10);

    filtered.forEach((question, index) => {
      const block = `${index + 1}. ${question.question_text}`;
      const lines = doc.splitTextToSize(block, 180);
      const needed = lines.length * 5 + 5;
      if (y + needed > 280) {
        doc.addPage();
        y = 18;
      }
      doc.text(lines, 14, y);
      y += needed;
    });
    doc.save("question-bank-ai.pdf");
  }

  if (!supabaseConfigured) {
    return (
      <main className="page">
        <div className="brand">📚 Question Bank AI</div>
        <section className="panel">
          <h1>Connect your Supabase project</h1>
          <p className="muted">The website code is installed, but its public Supabase project settings have not been added yet. Add the two environment variables listed in the README before running or deploying.</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="page">
        <header className="header"><div className="brand">📚 Question Bank AI</div><span className="tag">Your private cloud question bank</span></header>
        <section className="panel hero">
          <h1>One organised question bank. Everywhere.</h1>
          <p className="muted">Upload question papers and images, organise extracted questions, and access your question bank from your phone or laptop.</p>
          <button className="btn" onClick={signIn}>Continue with Google</button>
          <p className="small">Your uploaded files and questions are stored in your Supabase account.</p>
          {error && <div className="notice error">{error}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="header">
        <div className="brand">📚 Question Bank AI</div>
        <div className="row"><span className="small">{session.user.email}</span><button className="btn secondary" onClick={signOut}>Sign out</button></div>
      </header>

      <h1>Your question bank</h1>
      <p className="muted">Upload PDFs or images. Extracted questions are saved to your private cloud account.</p>

      <section className="panel">
        <h2>Upload question papers</h2>
        <div className="drop">
          <p><strong>Select one or more PDFs or images</strong></p>
          <p className="muted">Text-based PDFs and common image files are supported in this first version.</p>
          <input type="file" accept=".pdf,image/*" multiple disabled={busy} onChange={processFiles} />
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <label htmlFor="chapter">Chapter / topic (optional)&nbsp;</label>
          <input id="chapter" className="field" value={chapterInput} onChange={(e) => setChapterInput(e.target.value)} placeholder="e.g. Current Electricity" />
        </div>
        {busy && <div className="notice">{status}</div>}
        {!busy && status && <div className="notice success">{status}</div>}
        {error && <div className="notice error">{error}</div>}
      </section>

      <section className="panel">
        <div className="header">
          <h2>Saved questions ({questions.length})</h2>
          <div className="row">
            <button className="btn secondary" onClick={loadQuestions}>Refresh</button>
            <button className="btn" onClick={exportPdf} disabled={filtered.length === 0}>Export PDF</button>
          </div>
        </div>
        <div className="stats">
          <div className="stat">Total questions<strong>{questions.length}</strong></div>
          <div className="stat">MCQs<strong>{questions.filter((q) => q.question_type === "MCQ").length}</strong></div>
          <div className="stat">Descriptive<strong>{questions.filter((q) => q.question_type === "Descriptive").length}</strong></div>
        </div>
        <input className="field search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your questions…" />
        {filtered.length === 0 ? <p className="muted">No questions found yet. Upload a PDF or image to begin.</p> : filtered.map((q, i) => (
          <article className="question" key={q.id}>
            <span className="tag">{q.question_type || "Question"}</span>
            {q.chapter && <span className="tag">{q.chapter}</span>}
            <p>{i + 1}. {q.question_text}</p>
            {q.options?.length ? <ul>{q.options.map((option, optionIndex) => <li key={optionIndex}>{option}</li>)}</ul> : null}
          </article>
        ))}
      </section>
      <p className="small">Question Bank AI · Private user data is protected by Supabase Row Level Security.</p>
    </main>
  );
}
