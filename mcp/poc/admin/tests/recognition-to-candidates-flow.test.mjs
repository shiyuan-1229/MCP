import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, index, renderers] = await Promise.all([
  readFile(new URL('../assets/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../assets/modules/renderers.js', import.meta.url), 'utf8')
]);

assert.match(app, /确认识别并进入候选业务能力/u);
assert.match(app, /await confirmOpenapiSpec\(result\.spec_id\)/u);
assert.doesNotMatch(app, /提封装要求/u);
assert.doesNotMatch(index, /封装要求|开始封装选中能力|toggleAllCaps/u);

assert.match(renderers, /function candidateRecognitionMeta\(candidate\)/u);
assert.match(renderers, /rawPayload\?\.source_name/u);
assert.match(renderers, /来源资料/u);
assert.match(renderers, /识别时间/u);
assert.match(renderers, /本次识别/u);
assert.match(renderers, /renderCandidateRecognitionMeta\(c\)/u);
assert.match(renderers, /sort\(\(left, right\) => String\(right\.created_at/u);

console.log('recognition-to-candidates flow contract passed');
