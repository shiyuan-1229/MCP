# cpolar 免费公网隧道 - 完整教程

## 🎯 目标
把本地 `http://localhost:3456` 的 MCP Server 暴露到公网，腾讯元器可以直接调用。

## 📋 步骤（5 分钟）

### 第一步：下载 cpolar

打开浏览器访问：https://www.cpolar.com/download

下载 **Windows 版**（64 位 ZIP 包，约 8MB）。

### 第二步：解压到任意目录

例如解压到：`C:\cpolar\`

里面会有一个 `cpolar.exe` 文件。

### 第三步：把 cpolar 加到系统 PATH

**方法 A（推荐）：**
1. 右键「此电脑」→ 属性 → 高级系统设置 → 环境变量
2. 在「系统变量」找到 `Path` → 编辑 → 新建
3. 添加 `C:\cpolar`
4. 全点确定
5. **重新打开 cmd 窗口**

**方法 B（快速测试）：**
在 `C:\cpolar\` 目录下直接双击 `cpolar.exe`，可以临时用。

### 第四步：注册账号并获取 Token

1. 打开 https://www.cpolar.com/register 注册账号（免费，30 秒）
2. 登录后，地址栏输入：https://dashboard.cpolar.com/status
3. 找到「你的 AuthToken」，是一个长字符串，类似：
   ```
   ZTRjZmY5YjMtN2E0Yi00ZGNlLTk4ZjItY2FkNzg5MzE4YjEy
   ```
4. 复制这段 token

### 第五步：认证 cpolar

打开 cmd（PowerShell 也可以），执行：
```bash
cpolar authtoken ZTRjZmY5YjMtN2E0Yi00ZGNlLTk4ZjItY2FkNzg5MzE4YjEy
```
会显示「AuthToken 认证成功」。

### 第六步：一键启动（我做好了脚本）

双击 `poc/demo-server/start-cpolar.bat`，脚本会自动：
1. ✅ 启动 MCP Server（端口 3456）
2. ✅ 启动 cpolar 隧道
3. ✅ 显示公网 HTTPS 地址

### 第七步：填入腾讯元器

脚本会输出形如这样的地址：
```
https://abc123.cpolar.io
```

把下面的配置填到腾讯元器 MCP 插件：

| 配置项 | 值 |
|--------|-----|
| SSE URL | `https://abc123.cpolar.io/sse` |
| API Key | `demo-key-2026` |
| Header Key | `Authorization` |
| Header Value | `Bearer demo-key-2026` |

## 🎬 演示话术

开场：
> "我们的 MCP Server 已经部署到公网，我用腾讯元器模拟用户在微信里向 AI 助手提问。"

演示场景：
> 用户输入：「帮我查一下天河北店有没有元气森林，现在多少钱？」
>
> AI 调用 MCP Tool → 返回「天河北店有元气森林 500ml，零售价 5.5 元，近期促销买二送一。」
>
> "这就是我们 MCP 协议的威力，AI 不是凭空回答，而是真的调用了商家的库存系统。"

## ⚠️ 常见问题

### Q1: cpolar 显示「登录失败」或「认证错误」
**解决：** token 粘贴时不要带空格，账号必须邮箱验证通过。

### Q2: 公网地址会不会变？
**免费版会变**：每次重启 cpolar 都会分配新的子域名。
**付费版固定**：约 ¥20/月，可以保留固定域名。

### Q3: 答辩现场网络不通怎么办？
- 下载好的 cpolar.exe 直接装到答辩电脑，提前预约网络
- 也可以直接用 localhost（如果评委能连你的屏幕）

### Q4: cpolar 免费版流量限制
每月 1GB 流量。一个 MCP 调用大概几十到几百 KB，答辩演示用量完全够用。

## 📞 出错怎么办？

如果按步骤操作遇到问题，把错误截图发给我，我帮你排查。
