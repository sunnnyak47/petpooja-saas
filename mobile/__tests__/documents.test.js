// Mock the api layer (default export is an axios instance whose interceptor
// returns the unwrapped { success, data, message } envelope).
jest.mock('../src/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ success: true, data: [] }),
    post: jest.fn().mockResolvedValue({ success: true, data: {} }),
    delete: jest.fn().mockResolvedValue({ success: true, data: { deleted: true } }),
  },
}));

// OutletContext pulls in native modules transitively; the pure helpers under test
// don't need it, so mock it to a stable outlet id.
jest.mock('../src/context/OutletContext', () => ({
  useOutlet: () => ({ outletId: 'outlet-1', currentOutlet: null }),
}));

import {
  getExpiryStatus,
  groupByCategory,
  formatFileSize,
  fileIconFor,
  buildDocumentFormData,
  DOC_CATEGORIES,
} from '../src/hooks/useDocuments';

const NOW = new Date('2026-07-10T00:00:00.000Z');

describe('getExpiryStatus', () => {
  test('returns none when no expiry given', () => {
    expect(getExpiryStatus(null, NOW)).toEqual({ status: 'none', days: null });
    expect(getExpiryStatus(undefined, NOW).status).toBe('none');
    expect(getExpiryStatus('', NOW).status).toBe('none');
  });

  test('returns none for an invalid date', () => {
    expect(getExpiryStatus('not-a-date', NOW).status).toBe('none');
  });

  test('flags an already-expired document', () => {
    const res = getExpiryStatus('2026-07-01T00:00:00.000Z', NOW);
    expect(res.status).toBe('expired');
    expect(res.days).toBeLessThan(0);
  });

  test('flags a document expiring within 30 days as soon', () => {
    const res = getExpiryStatus('2026-07-25T00:00:00.000Z', NOW);
    expect(res.status).toBe('soon');
    expect(res.days).toBe(15);
  });

  test('boundary: exactly 30 days out is still soon', () => {
    const res = getExpiryStatus('2026-08-09T00:00:00.000Z', NOW);
    expect(res.status).toBe('soon');
    expect(res.days).toBe(30);
  });

  test('far-future expiry is ok', () => {
    const res = getExpiryStatus('2027-01-01T00:00:00.000Z', NOW);
    expect(res.status).toBe('ok');
    expect(res.days).toBeGreaterThan(30);
  });
});

describe('groupByCategory', () => {
  test('groups docs into ordered category sections, dropping empties', () => {
    const docs = [
      { id: '1', category: 'Menu' },
      { id: '2', category: 'License' },
      { id: '3', category: 'License' },
    ];
    const sections = groupByCategory(docs);
    expect(sections.map((s) => s.category)).toEqual(['License', 'Menu']);
    expect(sections[0].data).toHaveLength(2);
    expect(sections[1].data).toHaveLength(1);
  });

  test('unknown categories fall into Other', () => {
    const sections = groupByCategory([{ id: '1', category: 'Weird' }]);
    expect(sections).toHaveLength(1);
    expect(sections[0].category).toBe('Other');
  });

  test('empty input yields no sections', () => {
    expect(groupByCategory([])).toEqual([]);
    expect(groupByCategory()).toEqual([]);
  });

  test('section order always follows DOC_CATEGORIES', () => {
    const docs = DOC_CATEGORIES.slice().reverse().map((category, i) => ({ id: String(i), category }));
    const sections = groupByCategory(docs);
    expect(sections.map((s) => s.category)).toEqual(DOC_CATEGORIES);
  });
});

describe('formatFileSize', () => {
  test('handles missing / zero sizes', () => {
    expect(formatFileSize(null)).toBe('—');
    expect(formatFileSize(0)).toBe('—');
    expect(formatFileSize(undefined)).toBe('—');
  });

  test('formats bytes, KB and MB', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('fileIconFor', () => {
  test('detects pdf, image, sheet, word, and falls back', () => {
    expect(fileIconFor('application/pdf')).toBe('document-text');
    expect(fileIconFor('', 'license.pdf')).toBe('document-text');
    expect(fileIconFor('image/png')).toBe('image');
    expect(fileIconFor('', 'photo.JPG')).toBe('image');
    expect(fileIconFor('application/vnd.ms-excel')).toBe('grid');
    expect(fileIconFor('application/msword')).toBe('document');
    expect(fileIconFor('application/octet-stream', 'blob.bin')).toBe('document-attach');
  });
});

describe('buildDocumentFormData', () => {
  test('appends file + fields; omits empty expiry', () => {
    const form = buildDocumentFormData(
      { uri: 'file://a.pdf', name: 'a.pdf', mimeType: 'application/pdf' },
      { name: 'FSSAI', category: 'License', expires_at: null, outlet_id: 'outlet-1' }
    );
    // React Native's FormData exposes _parts; jsdom's exposes get().
    const parts = form._parts
      ? Object.fromEntries(form._parts.map(([k, v]) => [k, v]))
      : {
          file: form.get('file'),
          name: form.get('name'),
          category: form.get('category'),
          outlet_id: form.get('outlet_id'),
          expires_at: form.get('expires_at'),
        };

    expect(parts.name).toBe('FSSAI');
    expect(parts.category).toBe('License');
    expect(parts.outlet_id).toBe('outlet-1');
    expect(parts.file).toBeTruthy();
    expect(parts.expires_at == null || parts.expires_at === undefined).toBe(true);
  });

  test('includes expiry when provided', () => {
    const iso = '2026-12-31T00:00:00.000Z';
    const form = buildDocumentFormData(
      { uri: 'file://a.pdf', name: 'a.pdf' },
      { name: 'Cert', category: 'Certificate', expires_at: iso, outlet_id: 'o1' }
    );
    const has = form._parts
      ? form._parts.some(([k, v]) => k === 'expires_at' && v === iso)
      : form.get('expires_at') === iso;
    expect(has).toBe(true);
  });
});
