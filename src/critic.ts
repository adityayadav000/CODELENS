import 'dotenv/config';
import process from 'node:process';

export type RetrievedChunk = {
  path: string;
  start_line: number;
  end_line: number;
  content_preview: string;
};

export type CriticResult = {
  pass: boolean;
  notes: string;
};

export async function critiqueAnswer(
  question: string,
  draftAnswer: string,
  chunks: RetrievedChunk[],
): Promise<CriticResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { pass: false, notes: 'GROQ_API_KEY missing on server.' };
  }

  const evidence = chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.path}:${c.start_line}-${c.end_line}\n${c.content_preview}`,
    )
    .join('\n\n');

  const prompt = `
You are the Critic agent for a codebase Q&A system.
Only use the EVIDENCE. Do not invent files or line numbers.
Reply in EXACTLY 2 lines:
PASS: yes
NOTES: <short reason>
or
PASS: no
NOTES: <short reason>

QUESTION:
${question}

DRAFT ANSWER:
${draftAnswer}

EVIDENCE:
${evidence || '(no evidence)'}
`.trim();

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq error ${res.status}: ${body}`);
  }

    const data = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string; reasoning?: string };
    }>;
  };

  const message = data.choices?.[0]?.message;
  const text = (message?.content || message?.reasoning || '').trim();

  console.log('Critic raw:', text);

  const pass = /^PASS:\s*yes/im.test(text);
  const notesMatch = text.match(/NOTES:\s*(.+)/i);
  const notes =
    notesMatch?.[1]?.trim() ||
    text.slice(0, 200) ||
    'No notes from model';

  return { pass, notes };
}