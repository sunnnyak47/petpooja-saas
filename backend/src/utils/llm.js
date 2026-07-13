/**
 * @fileoverview Small provider-flexible LLM helper (JSON mode).
 * Prefers Groq (llama-3.3-70b, the client Voice POS already uses), falls back
 * to Gemini. Throws if neither key is configured so callers can degrade to a
 * deterministic path. Returns the parsed JSON object from the model.
 * @module utils/llm
 */

const https = require('https');
const logger = require('./../config/logger');

function callGroq(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.2,
    max_tokens: 700,
    response_format: { type: 'json_object' },
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(JSON.parse(parsed.choices?.[0]?.message?.content));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Groq request timed out')));
    req.write(body);
    req.end();
  });
}

async function callGemini(system, user) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    systemInstruction: system,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  });
  const res = await model.generateContent(user);
  return JSON.parse(res.response.text());
}

/**
 * Ask the configured LLM and get back the parsed JSON object it returns.
 * @param {string} system - system instruction
 * @param {string} user - user content
 * @returns {Promise<object>}
 */
async function callLLM(system, user) {
  if (process.env.GROQ_API_KEY) {
    return callGroq([{ role: 'system', content: system }, { role: 'user', content: user }]);
  }
  if (process.env.GEMINI_API_KEY) {
    return callGemini(system, user);
  }
  throw new Error('No LLM provider configured');
}

/** True when at least one provider key is present. */
function llmAvailable() {
  return !!(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY);
}

module.exports = { callLLM, llmAvailable };
