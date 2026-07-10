const fs = require('fs');
const p = 'D:/桌面/mcp方案/mcp/poc/admin/assets/modules/renderers.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/function renderGenerationFlow\(\) \{[\s\S]*?\n\}/, `function renderGenerationFlow() {
  const board = $('generationFlowBoard');
  const rows = $('projectPipelineRows');
  if (!board || !rows) return;

  const stages = [
    { label: '业务资料', value: list(state.sources).length, hint: '进入工厂的资料批次' },
    { label: 'OpenAPI 草案', value: list(state.openapiSpecs).length, hint: '完成识别的资料批次' },
    {
      label: 'Tool 装配',
      value: list(state.assets).reduce((sum, asset) => {
        try {
          const tools = typeof asset.tools === 'string' ? JSON.parse(asset.tools) : asset.tools;
          return sum + (Array.isArray(tools) ? tools.length : 0);
        } catch {
          return sum;
        }
      }, 0),
      hint: '可调用 Tool 总数'
    },
    { label: 'MCP 资产', value: list(state.assets).length, hint: '已封装资产数' },
    { label: '验证发布', value: list(state.releases).length, hint: '进入验证环节的版本' },
    { label: '交付资料', value: list(state.deliverables).length, hint: '已沉淀交付资料包' }
  ];

  board.innerHTML = stages.map(stage => metric(stage.label, stage.value, stage.hint)).join('');

  const projectRows = list(state.projects).map(project => {
    const customer = list(state.customers).find(item => item.id === project.customer_id);
    const sourceItems = list(state.sources).filter(item => item.project_id === project.id);
    const specItems = list(state.openapiSpecs).filter(item => item.project_id === project.id);
    const assetItems = list(state.assets).filter(item => item.project_id === project.id);
    const assetIds = new Set(assetItems.map(item => item.id));
    const toolCount = assetItems.reduce((sum, asset) => {
      try {
        const tools = typeof asset.tools === 'string' ? JSON.parse(asset.tools) : asset.tools;
        return sum + (Array.isArray(tools) ? tools.length : 0);
      } catch {
        return sum;
      }
    }, 0);
    const releaseItems = list(state.releases).filter(item => assetIds.has(item.asset_id));
    const deliverableItems = list(state.deliverables).filter(item => item.project_id === project.id);

    let blocker = '已进入持续优化';
    if (!sourceItems.length) blocker = '待导入业务资料';
    else if (!specItems.length) blocker = '待生成 OpenAPI 草案';
    else if (!toolCount) blocker = '待完成 Tool 装配';
    else if (!assetItems.length) blocker = '待产出 MCP 资产';
    else if (!releaseItems.length) blocker = '待进入验证发布';
    else if (!deliverableItems.length) blocker = '待整理交付资料';

    const stageCell = (count, readyLabel) => {
      const ready = Number(count) > 0;
      return `<span class="badge ${ready ? 'success' : 'warning'}">${ready ? '已完成' : '待处理'}</span><br><small class="muted-line">${readyLabel}：${count}</small>`;
    };

    return `<tr>
      <td><strong>${text(customer?.name || '-')}</strong><br><small class="muted-line">${text(project.name || '-')}</small></td>
      <td>${stageCell(sourceItems.length, '资料')}</td>
      <td>${stageCell(specItems.length, '草案')}</td>
      <td>${stageCell(toolCount, 'Tools')}</td>
      <td>${stageCell(assetItems.length, '资产')}</td>
      <td>${stageCell(releaseItems.length, '版本')}</td>
      <td>${stageCell(deliverableItems.length, '交付资料')}</td>
      <td><strong>${text(blocker)}</strong><br><small class="muted-line">${text(project.owner || '待分配负责人')}</small></td>
    </tr>`;
  });

  rows.innerHTML = projectRows.length
    ? projectRows.join('')
    : '<tr><td colspan="8">暂无项目加工链路数据</td></tr>';
}`);
fs.writeFileSync(p, s, 'utf8');
console.log('patched generation flow');
