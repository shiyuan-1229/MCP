import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

function createClassList() {
  const classes = new Set();
  return {
    add(...tokens) {
      tokens.forEach(token => classes.add(token));
    },
    remove(...tokens) {
      tokens.forEach(token => classes.delete(token));
    },
    toggle(token, force) {
      if (force === undefined) {
        if (classes.has(token)) {
          classes.delete(token);
          return false;
        }
        classes.add(token);
        return true;
      }
      if (force) classes.add(token);
      else classes.delete(token);
      return force;
    },
    contains(token) {
      return classes.has(token);
    }
  };
}

function createElement(id = '') {
  return {
    id,
    value: '',
    innerHTML: '',
    textContent: '',
    dataset: {},
    style: {},
    children: [],
    className: '',
    scrollTop: 0,
    scrollHeight: 480,
    classList: createClassList(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter(item => item !== child);
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
    addEventListener() {},
    querySelectorAll() {
      return [];
    }
  };
}

const elementStore = new Map();
const documentStub = {
  body: createElement('body'),
  createElement(tag) {
    return createElement(tag);
  },
  getElementById(id) {
    if (!elementStore.has(id)) {
      elementStore.set(id, createElement(id));
    }
    return elementStore.get(id);
  },
  querySelectorAll() {
    return [];
  }
};
documentStub.body.classList = createClassList();

globalThis.localStorage = createStorage();
globalThis.window = globalThis;
globalThis.document = documentStub;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { clipboard: { writeText: async () => {} } }
});

const stateUrl = pathToFileURL(path.resolve('D:/桌面/mcp方案/mcp/poc/admin/assets/modules/state.js')).href;
const renderersUrl = pathToFileURL(path.resolve('D:/桌面/mcp方案/mcp/poc/admin/assets/modules/renderers.js')).href;

const { state } = await import(stateUrl);
await import(`${renderersUrl}?case=customer-builder-conversation`);

state.user = { role: 'customer', username: 'demo', display_name: '演示客户' };
state.currentPage = 'mcp-builder';
state.assets = [];
state.customerDashboard = { assets: [] };
state.customerBuilderMessages = [];
state.customerBuilderResult = null;
state.customerBuilderDraft = '';
state.customerBuilderDetailTab = 'tools';
state.customerBuilderHistory = [];
state.customerBuilderSelectedHistoryId = null;
state.customerBuilderCurrentSessionId = '';

window.generateCustomerMcp('我想做一个售后客服 MCP，包含订单查询和工单创建。');
window.generateCustomerMcp('再加上会员权益提醒，继续沿用上一版。');

const messageNode = document.getElementById('customerBuilderMessages');
const messageHtml = messageNode.innerHTML;
const detailHtml = document.getElementById('customerBuilderDetailBody').innerHTML;
const summaryHtml = document.getElementById('customerBuilderResultSummary').innerHTML;
const historyHtml = document.getElementById('customerBuilderHistory').innerHTML;

assert.equal((messageHtml.match(/customer-builder-message/g) || []).length, 5, 'continuous chat should stay in the chat area');
assert.match(messageHtml, /售后客服 MCP/u);
assert.match(messageHtml, /会员权益提醒/u);
assert.match(detailHtml, /订单查询/u);
assert.match(detailHtml, /权益到期提醒/u);
assert.match(summaryHtml, /目标 MCP/u);
assert.doesNotMatch(historyHtml, /customer-builder-history-item/u, 'current chat turns should not be rendered as history items');
assert.equal(messageNode.scrollTop, messageNode.scrollHeight, 'message area should auto-scroll to the latest message');

window.saveBuilderDraft();

const savedHistoryHtml = document.getElementById('customerBuilderHistory').innerHTML;
assert.match(savedHistoryHtml, /customer-builder-history-item/u, 'saved session should appear in history');
assert.equal((savedHistoryHtml.match(/customer-builder-history-item/g) || []).length, 1, 'one session should create one history item');
assert.equal(state.customerBuilderHistory.length, 1, 'history state should store a single archived session');

const savedHistoryId = state.customerBuilderHistory[0].id;
window.previewCustomerBuilderHistory(savedHistoryId);

const previewSummary = document.getElementById('customerBuilderResultSummary').innerHTML;
const previewDetail = document.getElementById('customerBuilderDetailBody').innerHTML;
const previewHistory = document.getElementById('customerBuilderHistory').innerHTML;

assert.equal(state.customerBuilderSelectedHistoryId, savedHistoryId, 'selected history id should be tracked');
assert.match(previewSummary, /售后客服 MCP/u);
assert.match(previewSummary, /会员营销/u);
assert.match(previewDetail, /权益到期提醒/u);
assert.match(previewHistory, /customer-builder-history-item active/u, 'selected history session should be highlighted');

window.clearCustomerBuilder();
window.generateCustomerMcp('我想做一个物流催单 MCP。');

const newMessageHtml = document.getElementById('customerBuilderMessages').innerHTML;
const newHistoryHtml = document.getElementById('customerBuilderHistory').innerHTML;

assert.match(newMessageHtml, /物流催单/u);
assert.equal(state.customerBuilderSelectedHistoryId, null, 'new live chat should return to the current session view');
assert.equal(state.customerBuilderHistory.length, 1, 'starting a new live chat should not auto-create another history record');
assert.equal((newHistoryHtml.match(/customer-builder-history-item/g) || []).length, 1, 'history should still only contain archived sessions');

console.log('customer builder conversation checks passed');