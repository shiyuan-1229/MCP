# 全功能零售助手

> MCP Forge 自动生成 · 门店：完整版测试

## 启动方式

```bash
npm install
node server.js
```

## 连接信息

- SSE 端点：http://localhost:4001/sse
- 健康检查：http://localhost:4001/health

## Tool 列表

- product_search: 搜索商品，根据关键词匹配商品名称
- product_detail: 查询商品详情
- price_query: 查询商品价格
- promo_list: 查询当前所有促销活动
- inventory_query: 查询指定商品在各门店的库存数量
- inventory_alert: 查询库存不足的商品列表（库存<10）
- member_info: 查询会员信息
- member_points: 查询会员积分及可兑换优惠券
- coupon_query: 查询会员可用优惠券
- store_list: 查询附近门店列表及营业状态
- store_status: 查询指定门店的营业状态
- create_order: 创建新订单，自动应用会员优惠
- order_status: 查询订单状态