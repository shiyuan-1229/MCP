# MCP Forge 管理后台重构交接补充

> 日期：2026-07-09
> 主题：管理员后台从“运维接入台”重构为“企业业务资料 -> MCP 资产生成工厂后台”
> 状态：已完成第一轮结构改造，待进入第二轮文案与信息层收口

---

## 1. 本轮目标

本轮不再把管理员后台理解为：
- 客户自己接入系统的后台
- 平台运维配置台
- 零售 demo 的展示面板

而是开始明确重构成：

`企业业务资料 -> OpenAPI -> Tools -> MCP Server -> 测试发布 -> 交付治理`

也就是一个“把客户提交的业务接口、字段说明、数据库结构、文档资料，加工成 MCP 资产”的生成工厂后台。

---

## 2. 本轮已完成

### 2.1 一级导航已改造

管理员一级导航已经调整为：

1. `生成总览`
2. `资料接入`
3. `接口识别`
4. `Tool 映射`
5. `MCP 资产`
6. `测试发布`
7. `交付管理`
8. `治理与统计`
9. `设置`

### 2.2 页面 id 已同步改造

旧结构：
- `factory`
- `knowledge`
- `access`
- `gateway`
- `usage`
- `billing`
- `deliverables`

新结构已经落地为：
- `summary`
- `intake`
- `recognition`
- `tooling`
- `assets`
- `publish`
- `delivery`
- `governance`
- `settings`

### 2.3 factory 已拆页

旧 `factory` 不再是一个混合大页，已经拆成 4 个独立一级页：

- `intake`：承接业务资料导入、资料列表
- `recognition`：承接 OpenAPI 识别结果
- `tooling`：承接 Tool mapping
- `assets`：承接 MCP 资产、安全预览、时间线

### 2.4 渲染器已拆分

`renderers.js` 已经不再只依赖旧 `renderFactory()`。

当前已拆出：
- `renderIntake()`
- `renderRecognition()`
- `renderTooling()`
- `renderAssets()`

### 2.5 旧模块已完成第一轮归并

- `deliverables` 已改为 `delivery`
- `access + gateway + usage` 已归并到 `governance`
- `knowledge + billing` 已归并到 `settings`

### 2.6 知识库相关跳转已改新路由

- OpenAPI 跳转到 `recognition`
- 资产跳转到 `assets`
- 交付跳转到 `delivery`

---

## 3. 本轮改动文件

核心文件如下：

- `D:/桌面/mcp方案/mcp/poc/admin/assets/modules/state.js`
- `D:/桌面/mcp方案/mcp/poc/admin/index.html`
- `D:/桌面/mcp方案/mcp/poc/admin/assets/modules/renderers.js`
- `D:/桌面/mcp方案/mcp/poc/admin/assets/app.js`
- `D:/桌面/mcp方案/mcp/poc/admin/tests/admin-navigation.test.mjs`

---

## 4. 已完成验证

### 4.1 回归脚本通过

执行：

```bash
node D:\桌面\mcp方案\mcp\poc\admin\tests\admin-navigation.test.mjs
```

结果：

```text
admin navigation checks passed
```

### 4.2 语法检查通过

执行：

```bash
node --check D:\桌面\mcp方案\mcp\poc\admin\assets\modules\state.js
node --check D:\桌面\mcp方案\mcp\poc\admin\assets\modules\renderers.js
node --check D:\桌面\mcp方案\mcp\poc\admin\assets\app.js
```

结果：通过。

---

## 5. 当前遗留问题

这部分是下一会话最重要的起点。

### 5.1 index.html 新中文文案存在编码写入问题

当前 `index.html` 新插入的一批中文文案，出现了 `????` 的情况。

说明：
- 结构已经改对了
- 页面 id、路由、渲染器都已经对齐
- 但新写入的中文 copy 在 Windows 终端脚本写入过程中发生了字符降级

所以现在最优先的不是改后端，而是先把页面文案恢复正常中文。

### 5.2 当前只是“第一轮结构改造”

当前已经完成：
- 导航结构
- 页面骨架
- 渲染入口拆分
- 路由统一

当前还没完成：
- 全部页面标题与说明语统一
- 所有“接入配置 / 运维 / demo”残留词替换
- `governance` / `settings` 的信息层次整理

### 5.3 governance 和 settings 目前还是收口版

虽然能力已经归并进去，但页面仍然偏“拼接”，还没有完全形成清晰的产品叙事。

---

## 6. 下一轮建议优先级

建议下一会话严格按这个顺序继续：

1. 修复 `index.html` 中当前显示为 `????` 的中文文案
2. 统一 9 个一级页面的 `data-title / data-eyebrow / 卡片标题 / 表格标题`
3. 把“接入配置、运维、零售 demo”残留表达替换成“资料接入、接口识别、资产生成、交付治理”
4. 继续优化 `治理与统计` 和 `设置` 的信息层次
5. 暂时不要动后端数据层

---

## 7. 新会话建议提示词

新开会话后，建议直接发下面这段：

```md
请继续基于当前代码，接着做 MCP Forge 管理后台重构，不要从零重做，也不要回退我现有改动。

请先阅读这些文件：
- `D:/桌面/mcp方案/mcp/MCP_Forge_admin_handoff_2026-07-09.md`
- `D:/桌面/mcp方案/mcp/MCP_Forge_管理员导航重构方案.md`
- `D:/桌面/mcp方案/mcp/poc/admin/index.html`
- `D:/桌面/mcp方案/mcp/poc/admin/assets/app.js`
- `D:/桌面/mcp方案/mcp/poc/admin/assets/modules/state.js`
- `D:/桌面/mcp方案/mcp/poc/admin/assets/modules/renderers.js`
- `D:/桌面/mcp方案/mcp/poc/admin/tests/admin-navigation.test.mjs`

当前状态：
1. 一级导航已改成：生成总览 / 资料接入 / 接口识别 / Tool 映射 / MCP 资产 / 测试发布 / 交付管理 / 治理与统计 / 设置
2. 旧 factory 已拆成 intake / recognition / tooling / assets
3. 旧 deliverables 已改成 delivery
4. access + gateway + usage 已并入 governance
5. knowledge + billing 已并入 settings
6. 跳转路由和渲染入口已完成第一轮统一
7. 测试脚本 `admin-navigation.test.mjs` 已通过
8. 当前最大遗留问题是 `index.html` 新中文文案出现了 `????`

你下一步不要改后端，优先做这些事：
1. 修复 `index.html` 里当前显示为 `????` 的中文文案
2. 统一 9 个一级页面的中文叙事，让后台真正像“企业业务资料 -> MCP 资产生成工厂后台”
3. 清理所有容易误导成“客户系统接入平台 / 平台运维后台 / 零售 demo”的中文命名
4. 在保留现有结构的前提下，继续优化 `治理与统计` 和 `设置` 页的信息层次

要求：
- 严格基于现有代码继续改
- 不要把页面再改回旧导航
- 不要重写数据层
- 先做前端信息架构和文案层修正
- 改完后继续更新交接文档
```

---

## 8. 交接结论

当前适合直接开新会话继续推进。

阶段判断：
- 第一轮：导航结构和路由骨架重构，已完成
- 第二轮：中文文案恢复、主叙事统一、页面信息层优化，待继续

结论就是：方向没问题，骨架已经搭起来了，下一会话应该做的是收口和打磨，不是推翻重来。
