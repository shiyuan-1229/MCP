from pathlib import Path
import re

path = Path(r'D:/桌面/mcp方案/mcp/poc/admin/assets/modules/renderers.js')
content = path.read_text(encoding='utf-8')
replacement = '''function renderSummary() {
  const s = state.summary || {};
  const customerView = isCustomerView();
  const toolsCount = list(state.assets).reduce((sum, asset) => {
    try {
      const tools = typeof asset.tools === 'string' ? JSON.parse(asset.tools) : asset.tools;
      return sum + (Array.isArray(tools) ? tools.length : 0);
    } catch {
      return sum;
    }
  }, 0);
  const testingCount = list(state.releases).filter(item => ['testing', 'tested', 'ready_to_publish'].includes(item.status)).length;
  const deliveringCount = list(state.deliverables).filter(item => item.status !== 'ready').length;
  const recentSourceCount = list(state.sources).filter(item => {
    const stamp = item.created_at || item.updated_at;
    return stamp && String(stamp).slice(0, 10) >= '2026-07-01';
  }).length;
  $('summaryCards').innerHTML = customerView
    ? [
      metric('我的项目', list(state.projects).length, '当前可查看的交付项目'),
      metric('我的 MCP', list(state.assets).length, `${s.published || 0} 个已上线`),
      metric('本月调用', Number(s.calls || 0).toLocaleString('zh-CN'), `成功率 ${s.successRate || 0}%`),
      metric('我的账单', money(s.billingAmount), '仅统计当前客户账单')
    ].join('')
    : [
      metric('本周新增业务资料', recentSourceCount || list(state.sources).length, '进入工厂的新资料批次'),
      metric('已识别资料批次', list(state.openapiSpecs).length, '完成资料解析并可继续生成'),
      metric('已生成 OpenAPI 草案', list(state.openapiSpecs).length, '等待人工确认或继续装配'),
      metric('已装配 Tools', toolsCount, '从 OpenAPI 草案里整理出的可调用能力'),
      metric('已产出 MCP 资产', list(state.assets).length, `${s.published || 0} 个已对外发布`),
      metric('待验证资产', testingCount, '进入验证发布环节的资产'),
      metric('待交付资料包', deliveringCount, '仍在整理中的交付资料'),
      metric('已完成交付', s.published || 0, '可进入客户使用与持续优化阶段')
    ].join('');

  renderGenerationFlow();

  const allRows = buildProjectHealthRows(projectHealthData());
  const filters = state.projectFilters || {};
  const rows = buildProjectHealthRows(projectHealthData(), filters);
  renderProjectFilters(getProjectFilterOptions(allRows), filters, allRows.length, rows.length);

  $('projectRows').innerHTML = rows.length
    ? rows.map(row => `<tr class="project-row" data-project-open="${escapeHtml(row.projectId)}">
        <td>
          <div class="project-meta">
            <div>
              <strong>${text(row.customerName)}</strong><br><small class="muted-line">${text(row.projectName)}</small>
            </div>
            <button type="button" class="ghost-btn small project-row-action" data-project-open="${escapeHtml(row.projectId)}">详情</button>
          </div>
        </td>
        <td>${badge(row.stage)}<br><div class="env-stack">${environmentBadges(row.environments)}</div></td>
        <td>${progress(row.progress)}<small class="muted-line">${text(row.progress)}%</small></td>
        <td>${text(row.owner)}</td>
        <td>${text(row.milestone || '-')}</td>
        <td>${releaseText(row)}</td>
        <td>${certificateText(row)}</td>
        <td><span class="exception-count ${row.callExceptionCount > 0 ? 'has-error' : ''}">${text(row.callExceptionCount)}</span></td>
        <td>${billingBadge(row.billingStatus)}</td>
        <td>${healthBadge(row.healthStatus)}</td>
      </tr>`).join('')
    : `<tr><td colspan="10">${emptyState('没有符合筛选条件的项目')}</td></tr>`;

  document.querySelectorAll('#projectRows tr.project-row').forEach(row => {
    row.addEventListener('click', () => {
      window.openProjectDrawer?.(row.dataset.projectOpen);
    });
  });
  document.querySelectorAll('#projectRows .project-row-action').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      window.openProjectDrawer?.(button.dataset.projectOpen);
    });
  });

  $('activityList').innerHTML = list(state.releases).length
    ? list(state.releases).slice(0, 5).map(r => `<div class="info-card"><h4>${displayAssetName(r.asset_name)} ${text(r.version)}</h4><p>${displayStatus(r.status)} · ${text(r.notes || '暂无备注')} · 验证时间：${text(r.tested_at || '未验证')}</p></div>`).join('')
    : emptyState(customerView ? '暂无与你相关的发布记录' : '暂无加工记录');
}
'''
content, count = re.subn(r'function renderSummary\(\) \{[\s\S]*?(?=\nfunction renderProjectDrawer\()', replacement, content, count=1)
if count != 1:
    raise SystemExit('failed to replace renderSummary')
path.write_text(content, encoding='utf-8')
print('patched renderSummary')
