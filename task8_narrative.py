#!/usr/bin/env python3
"""Task #8: 统一产品叙事 - 清除所有残留文案，对齐 MCP 工厂主线"""
import re

files = {
    'renderers': r'D:\桌面\mcp方案\mcp\poc\admin\assets\modules\renderers.js',
    'state':     r'D:\桌面\mcp方案\mcp\poc\admin\assets\modules\state.js',
    'app':       r'D:\桌面\mcp方案\mcp\poc\admin\assets\app.js',
    'index':     r'D:\桌面\mcp方案\mcp\poc\admin\index.html',
}

# ============== 1. renderers.js ==============
with open(files['renderers'], 'r', encoding='utf-8') as f:
    content = f.read()

replacements_r = [
    # 注释：厂长驾驶舱 → 生成驾驶舱
    ('// 1. \u751f\u6210\u603b\u89c8 \u2014 \u5382\u957f\u9a7e\u9a76\u8231 + \u8d44\u4ea7\u751f\u6210\u6f0f\u6597',
     '// 1. \u751f\u6210\u603b\u89c8 \u2014 \u8d44\u4ea7\u751f\u6210\u9a7e\u9a76\u8231 + \u5168\u94fe\u8def\u6f0f\u6597'),
    
    # 空状态文案统一为工厂流水线语境
    ('\u6682\u65e0\u9879\u76ee\u52a0\u5de5\u94fe\u8def\u6570\u636e', '\u6682\u65e0\u9879\u76ee\u8d44\u4ea7\u751f\u6210\u94fe\u8def'),
    ('\u6682\u65e0\u52a0\u5de5\u8bb0\u5f55', '\u6682\u65e0\u8fd1\u671f\u52a8\u6001'),
    ('\u6682\u65e0 Tool \u88c5\u914d\u7ed3\u679c\u3002\u8bf7\u5148\u5b8c\u6210\u63a5\u53e3\u8bc6\u522b\u548c OpenAPI \u8349\u6848\u786e\u8ba4\u3002',
     '\u6682\u65e0 Tool \u6620\u5c04\u7ed3\u679c\u3002\u8bf7\u5148\u5728\u63a5\u53e3\u8bc6\u522b\u9875\u786e\u8ba4 OpenAPI \u8349\u6848\uff0c\u7cfb\u7edf\u5c06\u81ea\u52a8\u6620\u5c04\u4e3a MCP Tool\u3002'),
    ('\u6682\u65e0\u8d44\u4ea7\u751f\u6210\u8f68\u8ff9', '\u6682\u65e0 MCP \u8d44\u4ea7\u751f\u6210\u8f68\u8ff9'),
    ('\u6682\u65e4\u53d1\u5e03\u8bb0\u5f55', '\u6682\u65e4\u7248\u672c\u53d1\u5e03\u8bb0\u5f55'),
    ('\u6682\u65e0\u4ea4\u4ed8\u8d44\u6599', '\u6682\u65e4\u4ea4\u4ed8\u7269\u8d44\u6599'),
    ('\u9009\u62e9\u5de6\u4fa7\u8349\u6848\u67e5\u770b\u683c\u5f0f\u5316\u7684\u63a5\u53e3\u5b9a\u4e49', 
     '\u9009\u62e9\u5de6\u4fa7\u8349\u6848\u67e5\u770b AI \u8bc6\u522b\u51fa\u7684 OpenAPI 3.0 \u63a5\u53e3\u5b9a\u4e49'),

    # 指标卡 meta 文案优化
    ('\u5c01\u88c5\u5b8c\u6210', 'Tool \u6620\u5c04\u5b8c\u6210'),
    ('\u8bc6\u522b\u7ed3\u679c', 'AI \u8bc6\u522b\u51fa\u7684\u8349\u6848'),
    ('meta: \'\u53ef\u8fdb\u5165\u8349\u6848\u786e\u8ba4\'', 'meta: \'\u7b49\u5f85\u786e\u8ba4\u540e\u8fdb\u5165 Tool \u6620\u5c04\''),
    ('meta: \'\u53ef\u7528\u4e8e\u6620\u5c04\'', 'meta: \'\u5df2\u786e\u8ba4\uff0c\u53ef\u8fdb\u5165 Tool \u6620\u5c04\u9636\u6bb5\''),
    
    # 步骤条描述更精准
    ('AI \u6b63\u5728\u89e3\u6790', 'AI \u6b63\u5728\u8bc6\u522b\u4e1a\u52a1\u8d44\u6599\u4e2d\u7684\u63a5\u53e3\u5b9a\u4e49'),
]

for old, new in replacements_r:
    if old in content:
        content = content.replace(old, new)
        print(f'  [renderers] {old[:30]}... -> {new[:30]}...')
    else:
        print(f'  [renderers] NOT FOUND: {old[:40]}')

with open(files['renderers'], 'w', encoding='utf-8') as f:
    f.write(content)

# ============== 2. state.js ==============
with open(files['state'], 'r', encoding='utf-8') as f:
    content = f.read()

replacements_s = [
    # operationId 显示名中性化（保留行业特征但去掉过强的零售味）
    ("member_expiring_benefits: '\u4f1a\u5458\u5230\u671f\u6743\u76ca'",
     "member_expiring_benefits: '\u6743\u76ca\u5230\u671f\u63d0\u9192'"),
    ("store_service_kb: '\u95e8\u5e97\u670d\u52a1\u77e5\u8bc6\u5e93",
     "store_service_kb: '\u4e1a\u52a1\u77e5\u8bc6\u5e93\u68c0\u7d22"),
]

for old, new in replacements_s:
    if old in content:
        content = content.replace(old, new)
        print(f'  [state] {old[:40]}... -> {new[:40]}...')
    else:
        print(f'  [state] NOT FOUND: {old[:40]}')

with open(files['state'], 'w', encoding='utf-8') as f:
    f.write(content)

print('\nDone! Task #8 complete.')
