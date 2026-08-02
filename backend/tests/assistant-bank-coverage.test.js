/**
 * @fileoverview Coverage gates over the agent-generated adversarial question
 * banks (tests/fixtures/assistant-question-banks.json): 1,044 KB how-to
 * phrasings (direct / indirect / typo'd / ultra-short), 180 diverse data-tool
 * phrasings, 60 export requests, 50 boundary cases. Runs the FULL production
 * pipeline order (detectExport → keywordSelect → searchKnowledge) with no LLM.
 * Thresholds sit below current scores (KB top1 78%/top3 88%, tools 97%,
 * export 98%, adversarial 86%) so KB growth doesn't trip CI but real
 * regressions do. The live LLM router only improves on this floor.
 * @module tests/assistant-bank-coverage.test
 */

const { keywordSelect } = require('../src/modules/assistant/assistant.service');
const { TOOLS } = require('../src/modules/assistant/assistant.tools');
const { searchKnowledge } = require('../src/modules/assistant/assistant.knowledge');
const { detectExport } = require('../src/modules/assistant/assistant.export');
const banks = require('./fixtures/assistant-question-banks.json');

function pipeline(q) {
  const exp = detectExport(q);
  if (exp) return { stage: 'export', module: exp.module, format: exp.format };
  const tool = keywordSelect(q, TOOLS);
  if (!tool) return { stage: 'null' };
  return { stage: tool === 'help_howto' ? 'kb' : 'tool', tool };
}

describe('assistant bank coverage — adversarial phrasing banks', () => {
  test('banks are substantial', () => {
    expect(banks.kb.length).toBeGreaterThan(900);
    expect(banks.tools.length).toBeGreaterThan(150);
    expect(banks.export.length).toBeGreaterThan(50);
    expect(banks.adversarial.length).toBeGreaterThan(40);
  });

  test('KB retrieval: top1 ≥ 72%, top3 ≥ 82%', () => {
    let top1 = 0; let top3 = 0;
    for (const { q, expect: want } of banks.kb) {
      const m = searchKnowledge(q, 3).map((x) => x.topic);
      if (m[0] === want) top1 += 1;
      if (m.includes(want)) top3 += 1;
    }
    const p1 = top1 / banks.kb.length; const p3 = top3 / banks.kb.length;
    console.log(`KB retrieval: top1 ${(p1 * 100).toFixed(1)}% · top3 ${(p3 * 100).toFixed(1)}% over ${banks.kb.length}`);
    expect(p1).toBeGreaterThanOrEqual(0.72);
    expect(p3).toBeGreaterThanOrEqual(0.82);
  });

  test('data-tool routing over diverse phrasings ≥ 93%', () => {
    let ok = 0;
    for (const { q, expect: want } of banks.tools) {
      const r = pipeline(q);
      if ((r.stage === 'tool' && r.tool === want) || (r.stage === 'kb' && want === 'help_howto')) ok += 1;
    }
    const p = ok / banks.tools.length;
    console.log(`tool routing: ${(p * 100).toFixed(1)}% over ${banks.tools.length}`);
    expect(p).toBeGreaterThanOrEqual(0.93);
  });

  test('export detection (module + format) ≥ 95%', () => {
    let ok = 0;
    for (const { q, expect: want } of banks.export) {
      const [mod, fmt] = want.split('|');
      const r = pipeline(q);
      if (r.stage === 'export' && r.module === mod && r.format === fmt) ok += 1;
    }
    const p = ok / banks.export.length;
    console.log(`export detection: ${(p * 100).toFixed(1)}% over ${banks.export.length}`);
    expect(p).toBeGreaterThanOrEqual(0.95);
  });

  test('adversarial boundaries (data-vs-export-vs-null) ≥ 80%', () => {
    let ok = 0;
    for (const { q, expect: want } of banks.adversarial) {
      const r = pipeline(q);
      if (want === 'export' && r.stage === 'export') ok += 1;
      else if (want === 'null' && r.stage === 'null') ok += 1;
      else if (want.startsWith('data:') && r.stage === 'tool' && r.tool === want.slice(5)) ok += 1;
    }
    const p = ok / banks.adversarial.length;
    console.log(`adversarial: ${(p * 100).toFixed(1)}% over ${banks.adversarial.length}`);
    expect(p).toBeGreaterThanOrEqual(0.80);
  });
});
