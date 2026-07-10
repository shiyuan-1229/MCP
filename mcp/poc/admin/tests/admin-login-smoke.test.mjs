import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const renderersFilePath = path.join(adminRoot, 'assets', 'modules', 'renderers.js');

const source = await readFile(renderersFilePath, 'utf8');
const intakeSectionMatch = source.match(/function renderIntake\(\) \{[\s\S]*?\n\}/u);

assert.ok(intakeSectionMatch, 'renderIntake section should exist');

const intakeSection = intakeSectionMatch[0];

assert.match(intakeSection, /const statusBadge = badge\(item\.status \|\| 'draft'\);/u);
assert.match(intakeSection, /\+ statusBadge \+/u);
assert.match(intakeSection, /OpenAPI 已生成/u);

console.log('admin login smoke checks passed');