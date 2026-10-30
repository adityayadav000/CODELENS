import 'dotenv/config';

const apiKey = process.env.GROQ_API_KEY!;
const model = 'openai/gpt-oss-20b'; // must match critic.ts

const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
  }),
});

console.log('Status:', res.status);
console.log(await res.text());