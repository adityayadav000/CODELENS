# CodeLens

Codebase Q&A with **proof**: hybrid search over indexed code, citation-backed answers, and an optional LLM **critic** that checks the draft against retrieved chunks.

**Live demo:** https://codelens-i3zx.onrender.com/

---

## What it does

1. Index code (chunks + embeddings) into Postgres (`pgvector`)
2. User asks a question
3. **Retrieve** with hybrid search (vector similarity + full-text)
4. Build a draft answer with **file/line citations**
5. **Critic** (Groq) judges whether the draft matches the evidence
6. UI shows answer, critic verdict, and citation previews

This is a **multi-step RAG pipeline**, not a single “stuff the repo into a prompt” call.

---

## Stack

| Layer | Tech |
|--------|------|
| API / UI | Node.js, Express, static HTML |
| Language | TypeScript |
| DB | PostgreSQL + `pgvector` + full-text search |
| Embeddings | Local `@xenova/transformers` (`all-MiniLM-L6-v2`, 384-d) |
| Critic | Groq API (`openai/gpt-oss-20b`) |
| Local ops | Docker Compose |
| Deploy | Render (Docker web service + Postgres) |

---

## Architecture

```text
Browser (public/index.html)
    → POST /ask
        → searchChunks (embed question + hybrid SQL)
        → draft answer + citations
        → critiqueAnswer (Groq) [best-effort try/catch]
        → JSON { answer, citations, critic }