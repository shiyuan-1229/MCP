# test-deploy

> MCP Forge 自动生成 · 门店：测试门店

## 启动方式

```bash
npm install
node server.js
```

## 连接信息

- SSE 端点：http://localhost:4000/sse
- 健康检查：http://localhost:4000/health

## Tool 列表

- product_search: 搜索商品，根据关键词匹配商品名称
- product_detail: 查询商品详情
- price_query: 查询商品价格
- promo_list: 查询当前所有促销活动
- create_order: 创建新订单，自动应用会员优惠
- order_status: 查询订单状态