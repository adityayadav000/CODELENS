import 'dotenv/config';
import process from 'node:process';

export type EvidenceChunk = {
  path: string;
  start_line: number;
  end_line: number;
  content_preview: string;
};

/**
 * Reasoning agent: write an answer using ONLY the evidence chunks.
 */
export async function draftAnswerFromEvidence(
  question: string,
  chunks: EvidenceChunk[],
   previousDraft?: string,
  criticFeedback?: string,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return 'GROQ_API_KEY missing. Cannot draft an answer.';
  }

  if (chunks.length === 0) {
    return 'I could not find relevant code for this question.';
  }

  const evidence = chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.path}:${c.start_line}-${c.end_line}\n${c.content_preview}`,
    )
    .join('\n\n');

    // If this is a revision loop, inject the critic's critique into the instructions
  const reflectionSection =
    previousDraft && criticFeedback
      ? `
PREVIOUS DRAFT:
${previousDraft}
CRITIC FEEDBACK (WHY IT FAILED):
${criticFeedback}
INSTRUCTION FOR REVISION:
Carefully fix the issues noted by the Critic above. Ensure every claim strictly matches the EVIDENCE.
`
      : '';

  const prompt = `
You answer questions about a codebase.
Use ONLY the EVIDENCE below. Do not invent files, functions, or line numbers.
If evidence is weak, say what is uncertain.
Keep the answer concise (3-8 sentences).
When you mention code, include path and line range like index.js:1-12.
${reflectionSection}

QUESTION:
${question}

EVIDENCE:
${evidence}
`.trim();

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq answer error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning?: string } }>;
  };

  const message = data.choices?.[0]?.message;
  const text = (message?.content || message?.reasoning || '').trim();

  return text || 'Model returned an empty answer.';
}