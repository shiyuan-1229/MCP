import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const indexFilePath = path.join(adminRoot, 'index.html');

const html = await readFile(indexFilePath, 'utf8');
const sectionMatch = html.match(/<section id="my-deliverables"[\s\S]*?<\/section>/u);

assert.ok(sectionMatch, 'my-deliverables section should exist');

const section = sectionMatch[0];
const summaryIndex = section.indexOf('customerDeliverableSummary');
const highlightsIndex = section.indexOf('customerDeliverableHighlights');
const rowsIndex = section.indexOf('customerDeliverableRows');

assert.ok(summaryIndex >= 0, 'deliverable summary should exist');
assert.ok(highlightsIndex > summaryIndex, 'deliverable highlights should come after summary');
assert.ok(rowsIndex > highlightsIndex, 'deliverable download table should come after highlights');
assert.doesNotMatch(section, /content-grid two-col/u);

console.log('customer deliverables layout checks passed');
