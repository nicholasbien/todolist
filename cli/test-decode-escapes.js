#!/usr/bin/env node

/**
 * Test cases for decodeEscapes function
 */

// Copy of the improved decodeEscapes function for testing
function decodeEscapes(str) {
  if (str == null) return '';

  const escapes = {
    n: '\n',
    t: '\t',
    r: '\r',
    b: '\b',
    f: '\f',
    v: '\v',
    '\\': '\\',
    '"': '"',
    "'": "'",
  };

  return str.replace(
    /\\(?:([nrtbfv\\"'])|x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|(.?))/g,
    (_match, simple, hex, unicode, other) => {
      if (simple) {
        return escapes[simple];
      }
      if (hex) {
        return String.fromCharCode(parseInt(hex, 16));
      }
      if (unicode) {
        return String.fromCharCode(parseInt(unicode, 16));
      }
      return other === undefined ? '\\' : '\\' + other;
    }
  );
}

// Test cases
const tests = [
  // Basic escapes (original functionality)
  { input: 'Hello\\nWorld', expected: 'Hello\nWorld', desc: 'newline' },
  { input: 'Tab\\there', expected: 'Tab\there', desc: 'tab' },
  { input: 'Back\\\\slash', expected: 'Back\\slash', desc: 'backslash' },

  // New escapes
  { input: 'Line1\\r\\nLine2', expected: 'Line1\r\nLine2', desc: 'CRLF' },
  { input: 'Beep\\b', expected: 'Beep\b', desc: 'backspace' },
  { input: 'Form\\ffeed', expected: 'Form\ffeed', desc: 'form feed' },
  { input: 'Quote: \\\"test\\\"', expected: 'Quote: "test"', desc: 'double quote' },
  { input: "Quote: \\\'test\\\'", expected: "Quote: 'test'", desc: 'single quote' },
  { input: '\\vtab', expected: '\vtab', desc: 'vertical tab' },

  // Hex escapes
  { input: 'Hex\\x41', expected: 'HexA', desc: 'hex escape (0x41 = A)' },
  { input: 'Hex\\x0a', expected: 'Hex\n', desc: 'hex newline (0x0a)' },

  // Unicode escapes
  { input: 'Unicode\\u0041', expected: 'UnicodeA', desc: 'unicode escape (U+0041 = A)' },
  { input: 'Emoji\\u2764', expected: 'Emoji❤', desc: 'unicode heart' },

  // Edge cases
  { input: null, expected: '', desc: 'null input' },
  { input: undefined, expected: '', desc: 'undefined input' },
  { input: '', expected: '', desc: 'empty string' },
  { input: 'No escapes', expected: 'No escapes', desc: 'no escapes' },
  { input: 'Trailing\\', expected: 'Trailing\\', desc: 'trailing backslash' },
  { input: 'Unknown\\z', expected: 'Unknown\\z', desc: 'unknown escape preserved' },
  { input: 'Multiple\\n\\t\\r', expected: 'Multiple\n\t\r', desc: 'multiple escapes' },
  { input: '\\n\\n\\n', expected: '\n\n\n', desc: 'consecutive escapes' },

  // Backward compatibility - existing behavior
  { input: 'Task: buy milk\\nPriority: high', expected: 'Task: buy milk\nPriority: high', desc: 'CLI use case (post-message)' },
];

let passed = 0;
let failed = 0;

console.log('Running decodeEscapes tests...\n');

for (const test of tests) {
  const result = decodeEscapes(test.input);
  const success = result === test.expected;

  if (success) {
    console.log(`✅ ${test.desc}`);
    passed++;
  } else {
    console.log(`❌ ${test.desc}`);
    console.log(`   Input:    ${JSON.stringify(test.input)}`);
    console.log(`   Expected: ${JSON.stringify(test.expected)}`);
    console.log(`   Got:      ${JSON.stringify(result)}`);
    failed++;
  }
}

console.log(`\n${passed}/${tests.length} tests passed`);
if (failed > 0) {
  console.log(`${failed} tests failed`);
  process.exit(1);
}
console.log('All tests passed! ✅');
