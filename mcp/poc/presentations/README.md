# MCP Forge · 演示物料归档

本目录包含 MCP Forge 项目的演示物料，按用途分类存放。

## 目录结构

```
presentations/
├── screenshots/      # 截图与参考图
│   ├── corner-check-ref.png        # 圆角设计参考
│   ├── login-bg-frazetta-ref.png   # 登录页背景参考（Frazetta 风格）
│   ├── login-enter-key-ref.png     # Enter 按钮参考
│   ├── login-glow-test.png         # 发光效果测试截图
│   └── login-page-screenshot.png   # 登录页最终截图
│
├── assets/           # 可复用素材
│   ├── login-bg-backup.png         # 登录背景备份
│   ├── brand-icon.png              # 品牌图标（仍在 admin/ 中引用）
│   └── login-bg.png                # 登录背景（仍在 admin/ 中引用）
│
├── docs/             # 设计文档与方案
│   ├── agent-large-retail-scenario.md   # 大零售场景方案
│   ├── phase3-kbaas-design.md           # Phase3 KBaaS 设计
│   └── DEPLOY.md                        # Docker 部署指南（仍在根目录）
│
└── demos/            # 独立演示页面
    └── logs-demo.html                   # 操作日志演示页面
```

## 使用说明

- **screenshots/**：用于项目汇报、文档插图、社交媒体分享
- **assets/**：品牌视觉素材，admin 页面仍有引用
- **docs/**：技术方案文档，归档后便于查阅
- **demos/**：独立 HTML 演示页面，可直接在浏览器打开

## 注意事项

- `login-bg.png` 和 `brand-icon.png` 仍被 `admin/index.html` 引用，保留在原位置
- `bg-b64.txt` 为 base64 编码图片数据，如需清理请确认无引用
