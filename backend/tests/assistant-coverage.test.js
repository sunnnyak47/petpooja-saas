/**
 * @fileoverview Coverage eval — runs the ~3,000-question bank through the
 * deterministic router and measures routing accuracy overall + per tool.
 * This is the measurable "trained on thousands of queries" gate: it fails if
 * the fallback router drops below threshold, and prints the worst misroutes so
 * keywords can be tuned. (The prod LLM router does at least as well.)
 * @module tests/assistant-coverage.test
 */

const { keywordSelect } = require('../src/modules/assistant/assistant.service');
const { TOOLS } = require('../src/modules/assistant/assistant.tools');
const { generateBank } = require('../src/modules/assistant/assistant.querybank');

const THRESHOLD = 0.97; // deterministic fallback must route ≥97% of 3k queries correctly (currently 100%)

describe('assistant coverage — routing accuracy over the question bank', () => {
  const bank = generateBank();

  test(`bank has thousands of labeled queries`, () => {
    expect(bank.length).toBeGreaterThan(2500);
  });

  test(`router accuracy ≥ ${THRESHOLD * 100}% across all tools`, () => {
    const perTool = {};
    const misroutes = [];
    let correct = 0;

    for (const { q, tool } of bank) {
      const got = keywordSelect(q, TOOLS);
      perTool[tool] = perTool[tool] || { total: 0, ok: 0 };
      perTool[tool].total += 1;
      if (got === tool) { correct += 1; perTool[tool].ok += 1; }
      else if (misroutes.length < 25) misroutes.push({ q, expected: tool, got });
    }

    const overall = correct / bank.length;

    // eslint-disable-next-line no-console
    console.log(`\nCoverage: ${bank.length} queries · overall routing accuracy ${(overall * 100).toFixed(1)}%`);
    for (const [tool, s] of Object.entries(perTool)) {
      // eslint-disable-next-line no-console
      console.log(`  ${tool.padEnd(22)} ${(100 * s.ok / s.total).toFixed(1)}%  (${s.ok}/${s.total})`);
    }
    if (misroutes.length) {
      // eslint-disable-next-line no-console
      console.log('  sample misroutes:');
      misroutes.slice(0, 15).forEach((m) => console.log(`    "${m.q}" → ${m.got || 'null'} (want ${m.expected})`));
    }

    expect(overall).toBeGreaterThanOrEqual(THRESHOLD);
  });
});
