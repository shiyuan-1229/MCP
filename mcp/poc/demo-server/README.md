# MCP Forge · 零售门店 AI 助手（Demo）

> 全功能 MCP Server，包含 13 个 Tool，支持 API Key 认证
> 生成时间：2026-07-02

## 快速启动

```bash
npm install
node server.js
```

## 端点

| 地址 | 说明 | 认证 |
|------|------|:--:|
| `/sse` | MCP SSE 端点 | API Key |
| `/health` | 健康检查 | 无 |

## 13 个 MCP Tool

### 📦 商品 (4)
- `product_search` — 搜索商品
- `product_detail` — 商品详情
- `price_query` — 价格查询
- `promo_list` — 促销列表

### 📋 库存 (2)  
- `inventory_query` — 库存查询
- `inventory_alert` — 库存预警

### 👤 会员 (3)
- `member_info` — 会员信息
- `member_points` — 积分查询
- `coupon_query` — 优惠券查询

### 📍 门店 (2)
- `store_list` — 门店列表
- `store_status` — 门店状态

### 🛒 订单 (2)
- `create_order` — 创建订单
- `order_status` — 订单状态

## API Key 认证

启动后控制台会打印 API Key，使用方式：

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3456/sse
# 或
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:3456/sse
```
