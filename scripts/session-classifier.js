#!/usr/bin/env node

const CODING_KEYWORDS = [
  'bug',
  'fix',
  'implement',
  'code',
  'portfolio',
  'calculation',
  'deploy',
];

const SIMPLE_KEYWORDS = [
  'who',
  'what',
  'test',
  'hello',
  'question',
];

const CODE_SIGNAL_PATTERNS = [
  /\b(api|endpoint|stack trace|exception|refactor|function|module|script|database)\b/i,
  /\b\w+\.(js|ts|py|tsx|jsx|json|md)\b/i,
  /`[^`]+`/, // inline code fragment
  /\/[-_a-z0-9]+\//i, // path-like text
];

function normalizeText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function getLastUserMessage(session) {
  const messages = Array.isArray(session?.display_messages) ? session.display_messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === 'user' && normalizeText(msg.content)) {
      return normalizeText(msg.content);
    }
  }
  return '';
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findKeywordMatches(text, keywords) {
  const matches = [];
  for (const keyword of keywords) {
    const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
    if (pattern.test(text)) {
      matches.push(keyword);
    }
  }
  return matches;
}

function classifySession(input) {
  const session = typeof input === 'string' ? { last_message: input } : (input || {});
  const title = normalizeText(session.title);
  const lastMessage = normalizeText(session.last_message);
  const userMessage = normalizeText(session.user_message || session.prompt || getLastUserMessage(session));

  const corpus = [title, lastMessage, userMessage]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  const codingMatches = findKeywordMatches(corpus, CODING_KEYWORDS);
  const simpleMatches = findKeywordMatches(corpus, SIMPLE_KEYWORDS);
  const hasCodeSignals = CODE_SIGNAL_PATTERNS.some((pattern) => pattern.test(corpus));

  let type = 'simple';
  let reason = 'Matched simple keywords';

  if (codingMatches.length || simpleMatches.length) {
    if (codingMatches.length >= simpleMatches.length && codingMatches.length > 0) {
      type = 'coding';
      reason = 'Matched coding keywords';
    } else {
      type = 'simple';
      reason = 'Matched simple keywords';
    }
  } else if (hasCodeSignals) {
    type = 'coding';
    reason = 'Detected code-like signals';
  } else if (!corpus) {
    type = 'simple';
    reason = 'No message content found';
  } else if (corpus.includes('?')) {
    type = 'simple';
    reason = 'Question-style message without coding signals';
  } else {
    type = 'simple';
    reason = 'Defaulted to simple response';
  }

  return {
    type,
    reason,
    matchedKeywords: {
      coding: codingMatches,
      simple: simpleMatches,
    },
    text: userMessage || lastMessage || title,
  };
}

module.exports = {
  CODING_KEYWORDS,
  SIMPLE_KEYWORDS,
  classifySession,
  getLastUserMessage,
};

if (require.main === module) {
  const text = process.argv.slice(2).join(' ');
  const result = classifySession(text);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
