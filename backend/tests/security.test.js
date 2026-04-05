/**
 * @fileoverview Unit tests for security middleware.
 * @module tests/security.test
 */

const { sanitizeValue } = require('../src/middleware/security.middleware');

describe('Security Middleware — Input Sanitization', () => {
  test('should strip HTML script tags', () => {
    const input = 'Hello <script>alert("xss")</script> World';
    expect(sanitizeValue(input)).toBe('Hello  World');
  });

  test('should strip HTML tags', () => {
    const input = 'Hello <b>bold</b> <img src=x onerror=alert(1)>';
    expect(sanitizeValue(input)).toBe('Hello bold');
  });

  test('should strip javascript: protocol', () => {
    const input = 'javascript:alert(1)';
    expect(sanitizeValue(input)).toBe('alert(1)');
  });

  test('should strip event handlers', () => {
    const input = 'onload=alert(1)';
    expect(sanitizeValue(input)).toBe('alert(1)');
  });

  test('should strip data:text/html', () => {
    const input = 'data:text/html,<script>alert(1)</script>';
    expect(sanitizeValue(input)).toBe(',');
  });

  test('should handle nested objects', () => {
    const input = {
      name: '<script>alert("xss")</script>John',
      address: { city: '<b>Mumbai</b>', pin: '400001' },
    };
    const result = sanitizeValue(input);
    expect(result.name).toBe('John');
    expect(result.address.city).toBe('Mumbai');
    expect(result.address.pin).toBe('400001');
  });

  test('should handle arrays', () => {
    const input = ['<script>bad</script>', 'good', '<img src=x>'];
    const result = sanitizeValue(input);
    expect(result).toEqual(['', 'good', '']);
  });

  test('should pass through numbers and booleans unchanged', () => {
    expect(sanitizeValue(42)).toBe(42);
    expect(sanitizeValue(true)).toBe(true);
    expect(sanitizeValue(null)).toBeNull();
  });

  test('should trim whitespace', () => {
    expect(sanitizeValue('  hello  ')).toBe('hello');
  });
});

describe('Security Middleware — GST Calculations', () => {
  const { calculateGST } = require('../src/utils/helpers');

  test('should calculate 5% GST correctly (same state)', () => {
    const result = calculateGST(1000, 5, true);
    expect(result.totalTax).toBe(50);
    expect(result.cgst).toBe(25);
    expect(result.sgst).toBe(25);
  });

  test('should calculate 18% GST correctly (same state)', () => {
    const result = calculateGST(1000, 18, true);
    expect(result.totalTax).toBe(180);
    expect(result.cgst).toBe(90);
    expect(result.sgst).toBe(90);
  });

  test('should calculate IGST for different state', () => {
    const result = calculateGST(1000, 18, false);
    expect(result.totalTax).toBe(180);
    expect(result.igst).toBe(180);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
  });

  test('should return 0 tax for 0 amount', () => {
    const result = calculateGST(0, 5, true);
    expect(result.totalTax).toBe(0);
  });
});
