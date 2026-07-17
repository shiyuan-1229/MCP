import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const pocRoot = path.resolve(adminRoot, '..');

const [html, app, server, css] = await Promise.all([
  readFile(path.join(adminRoot, 'index.html'), 'utf8'),
  readFile(path.join(adminRoot, 'assets', 'app.js'), 'utf8'),
  readFile(path.join(pocRoot, 'server', 'server.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets', 'styles.css'), 'utf8')
]);

assert.match(server, /function normalizeOpenAIChatUrl\(baseUrl\)/u, 'chat URL normalization must be explicit');
assert.ok(server.includes('replace(/\\/+$/, "")'), 'chat URL normalization must remove trailing slashes');
assert.ok(server.includes("/v1/chat/completions"), 'chat URL normalization must preserve a complete chat endpoint');
assert.ok(server.includes('return /\\/v1$/i.test(normalizedBase)'), 'chat URL normalization must not duplicate an existing API version');
assert.match(server, /const chatUrl = normalizeOpenAIChatUrl\(aiUrl\);/u, 'WorkBuddy must use the normalized chat URL');
const normalizerSource = server.match(/function normalizeOpenAIChatUrl\(baseUrl\) \{[\s\S]*?\n\}(?=\napp\.post)/u)?.[0];
assert.ok(normalizerSource, 'chat URL normalizer source must be extractable');
const normalizeOpenAIChatUrl = new Function(`${normalizerSource}; return normalizeOpenAIChatUrl;`)();
assert.equal(normalizeOpenAIChatUrl('https://model.example.com'), 'https://model.example.com/v1/chat/completions');
assert.equal(normalizeOpenAIChatUrl('https://model.example.com/v1/'), 'https://model.example.com/v1/chat/completions');
assert.equal(normalizeOpenAIChatUrl('https://model.example.com/v1/chat/completions'), 'https://model.example.com/v1/chat/completions');
assert.match(server, /function normalizeOpenAIResponsesUrl\(baseUrl\)/u, 'Responses fallback must normalize its endpoint');
const responsesNormalizerSource = server.match(/function normalizeOpenAIResponsesUrl\(baseUrl\) \{[\s\S]*?\n\}(?=\n\nfunction getResponsesOutputText)/u)?.[0];
assert.ok(responsesNormalizerSource, 'Responses URL normalizer source must be extractable');
const normalizeOpenAIResponsesUrl = new Function(`${responsesNormalizerSource}; return normalizeOpenAIResponsesUrl;`)();
assert.equal(normalizeOpenAIResponsesUrl('https://model.example.com'), 'https://model.example.com/v1/responses');
assert.equal(normalizeOpenAIResponsesUrl('https://model.example.com/v1/'), 'https://model.example.com/v1/responses');
assert.equal(normalizeOpenAIResponsesUrl('https://model.example.com/proxy'), 'https://model.example.com/proxy/responses');
assert.match(server, /return res\.json\(await runResponsesWorkBuddyChat\(/u, 'a 404 chat endpoint must fall back to the Responses protocol');
const toolDecisionParserSource = server.match(/function parseWorkBuddyToolDecision\(content\) \{[\s\S]*?\n\}(?=\n\nasync function runResponsesWorkBuddyChat)/u)?.[0];
assert.ok(toolDecisionParserSource, 'Tool decision parser source must be extractable');
const parseWorkBuddyToolDecision = new Function(`${toolDecisionParserSource}; return parseWorkBuddyToolDecision;`)();
assert.deepEqual(parseWorkBuddyToolDecision('{"action":"call_tool","tool":"sales_top_products","args":{"top_n":5}}'), { action: 'call_tool', tool: 'sales_top_products', args: { top_n: 5 } });
assert.match(server, /function normalizeWorkBuddyTools\(rawTools\)/u, 'legacy Tool names must be normalized for WorkBuddy');
assert.match(server, /normalizeWorkBuddyTools\(decode\(asset\.tools\)\)/u, 'WorkBuddy endpoints must accept legacy Tool names');

for (const token of ['workbuddy-console', 'workbuddy-message', 'workbuddy-execution', 'workbuddy-composer']) {
  assert.match(html + app + css, new RegExp(token, 'u'), `missing redesigned WorkBuddy UI token: ${token}`);
}

assert.doesNotMatch(app, /AI \u8fd4\u56de \$\{resp\.status\}/u, 'raw provider errors must not be rendered as the customer-facing chat message');

console.log('WorkBuddy chat endpoint and UI checks passed');
