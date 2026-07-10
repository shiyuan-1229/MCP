/**
 * 绿城 CDP 真实数据库 DDL 样本 —— 用作 AI 识别的测试数据
 * 来源：MySQL 10.20.8.102 lvchengcdp_* 系列库
 */

export const LVCHENG_DDL_SAMPLES = {
  member: {
    name: '绿城CDP 会员库 (lvchengcdp_member)',
    type: 'Database',
    auth_mode: 'Internal Token',
    description: '绿城客户数据平台会员主数据库，包含 98 万+ 会员信息、会员等级、等级变更历史、车辆绑定、公寓/商户/酒店会员扩展信息等',
    sampleContent: `-- 会员主表 (98万行)
CREATE TABLE member_info (
  id bigint NOT NULL PRIMARY KEY,
  uuid varchar(255) NOT NULL COMMENT '会员唯一标识',
  vip_code varchar(255) NOT NULL COMMENT '会员卡号',
  name varchar(255) COMMENT '姓名',
  nick_name varchar(255) COMMENT '昵称',
  display_name varchar(255) COMMENT '展示名',
  mobile varchar(255) COMMENT '手机号',
  gender varchar(255) COMMENT '性别',
  birthday date COMMENT '生日',
  e_mail varchar(255) COMMENT '邮箱',
  level varchar(255) COMMENT '会员等级',
  mall_id varchar(255) COMMENT '所属商城ID',
  store_id varchar(255) COMMENT '所属门店ID',
  bloc_id varchar(255) COMMENT '所属集团ID',
  wx_openid varchar(255) COMMENT '微信OpenID',
  wx_unionid varchar(255) COMMENT '微信UnionID',
  alipay_openid varchar(255) COMMENT '支付宝OpenID',
  dy_open_id varchar(255) COMMENT '抖音OpenID',
  regitry_channel varchar(255) COMMENT '注册渠道',
  source varchar(255) COMMENT '来源',
  last_login_time datetime COMMENT '最后登录时间',
  enabled bit(1) COMMENT '是否启用',
  id_card_number varchar(255) COMMENT '身份证号',
  id_card_type varchar(255) COMMENT '证件类型',
  can_car_owner bit(1) COMMENT '是否车主',
  can_employees bit(1) COMMENT '是否员工',
  can_owner bit(1) COMMENT '是否业主',
  can_married varchar(255) COMMENT '婚姻状况',
  avatar varchar(255) COMMENT '头像',
  address varchar(255) COMMENT '地址',
  car_number varchar(255) COMMENT '车牌号',
  phone_number_location varchar(255) COMMENT '归属地',
  reserve_7 varchar(255) COMMENT '是否关注公众号'
);

-- 会员等级表
CREATE TABLE member_level (
  id bigint PRIMARY KEY,
  level_name varchar(255) COMMENT '等级名称',
  level_code varchar(255) COMMENT '等级编码',
  min_points int COMMENT '最低积分',
  discount decimal(5,2) COMMENT '折扣率',
  enabled bit(1) COMMENT '是否启用'
);

-- 会员等级变更历史
CREATE TABLE member_level_change_history (
  id bigint PRIMARY KEY,
  member_id varchar(255) COMMENT '会员ID',
  old_level varchar(255) COMMENT '原等级',
  new_level varchar(255) COMMENT '新等级',
  change_reason varchar(255) COMMENT '变更原因',
  change_time datetime COMMENT '变更时间'
);

-- 会员公寓扩展信息
CREATE TABLE member_info_tmp_apartment (
  id bigint PRIMARY KEY,
  member_uuid varchar(255) COMMENT '会员UUID',
  apartment_name varchar(255) COMMENT '公寓名称',
  room_no varchar(255) COMMENT '房号',
  check_in_date date COMMENT '入住日期'
);

-- 会员商户扩展信息 (95万行)
CREATE TABLE member_info_tmp_business (
  id bigint PRIMARY KEY,
  member_uuid varchar(255) COMMENT '会员UUID',
  business_name varchar(255) COMMENT '商户名称',
  business_type varchar(255) COMMENT '商户类型',
  contact_person varchar(255) COMMENT '联系人'
);

-- 会员酒店扩展信息
CREATE TABLE member_info_tmp_hotel (
  id bigint PRIMARY KEY,
  member_uuid varchar(255) COMMENT '会员UUID',
  hotel_name varchar(255) COMMENT '酒店名称',
  room_type varchar(255) COMMENT '房型',
  check_in_date date COMMENT '入住日期',
  check_out_date date COMMENT '退房日期'
);`
  },

  order: {
    name: '绿城CDP 订单库 (lvchengcdp_cdporder)',
    type: 'Database',
    auth_mode: 'API Key',
    description: '绿城客户数据平台订单分表库，按 mall_id 分表 0~35，包含订单主表和订单明细表，总计 85 万+ 订单记录。支持订单创建、支付、退款、完成、取消等全生命周期',
    sampleContent: `-- 订单主表 (分表 cdporder_0 ~ cdporder_35, 85万行)
CREATE TABLE cdporder_16 (
  id bigint NOT NULL PRIMARY KEY,
  type varchar(31) COMMENT '订单类型(NORMAL/REFUND)',
  uuid varchar(255) NOT NULL COMMENT '订单唯一标识',
  order_id varchar(128) COMMENT '业务订单号',
  order_type varchar(255) COMMENT '订单类型(REFUND/SALE)',
  orig_order_id varchar(255) COMMENT '原始订单号(退款用)',
  ref_order_id varchar(255) COMMENT '关联订单号',
  out_id varchar(255) COMMENT '外部订单号',
  biz_id varchar(255) COMMENT '业务ID',
  bloc varchar(255) COMMENT '集团ID',
  mall varchar(255) COMMENT '商城ID',
  mall_name varchar(255) COMMENT '商城名称',
  store varchar(255) COMMENT '门店ID',
  store_name varchar(255) COMMENT '终端名称',
  user_id varchar(255) COMMENT '会员ID',
  total_amount decimal(19,2) COMMENT '订单总金额',
  status varchar(255) COMMENT '订单状态',
  status_text varchar(255) COMMENT '状态描述',
  order_time datetime COMMENT '下单时间',
  pay_time datetime COMMENT '支付时间',
  shipping_time datetime COMMENT '发货时间',
  complete_time datetime COMMENT '完成时间',
  cancel_time datetime COMMENT '取消时间',
  cancel_by varchar(255) COMMENT '取消人',
  cancel_reason varchar(255) COMMENT '取消原因',
  refund_time datetime COMMENT '退款时间',
  refund_by varchar(255) COMMENT '退款人',
  refund_reason varchar(255) COMMENT '退款原因',
  close_time datetime COMMENT '关闭时间',
  close_by varchar(255) COMMENT '关闭人',
  close_reason varchar(255) COMMENT '关闭原因',
  device varchar(255) COMMENT '下单设备(OPENAPI/POS/APP)',
  provider varchar(255) COMMENT '服务商(LVCHENG等)',
  source varchar(255) COMMENT '来源',
  till varchar(255) COMMENT '收银台',
  remark varchar(255) COMMENT '备注',
  external bit(1) COMMENT '是否外部订单',
  hidden bit(1) COMMENT '是否隐藏',
  allow_add_point bit(1) COMMENT '是否允许积分'
);

-- 订单明细表 (分表 item_0 ~ item_31, 4万行)
CREATE TABLE item_16 (
  id bigint NOT NULL PRIMARY KEY,
  uuid varchar(255) NOT NULL COMMENT '明细唯一标识',
  order_id bigint COMMENT '关联订单ID',
  code varchar(255) COMMENT '商品编码',
  name varchar(255) COMMENT '商品名称',
  price decimal(19,2) COMMENT '商品单价',
  quantity int COMMENT '购买数量',
  total decimal(19,2) COMMENT '小计金额',
  sort_order varchar(255) COMMENT '排序',
  order_time datetime COMMENT '下单时间',
  mall varchar(255) COMMENT '商城ID',
  store varchar(255) COMMENT '门店ID',
  bloc varchar(255) COMMENT '集团ID'
);

-- 订单审核历史
CREATE TABLE order_review_history_1 (
  id bigint PRIMARY KEY,
  order_id varchar(255) COMMENT '订单号',
  review_status varchar(255) COMMENT '审核状态',
  reviewer varchar(255) COMMENT '审核人',
  review_time datetime COMMENT '审核时间',
  review_remark varchar(255) COMMENT '审核备注'
);`
  },

  marketing: {
    name: '绿城CDP 营销费用库 (lvchengcdp_expenses)',
    type: 'Database',
    auth_mode: 'OAuth',
    description: '绿城客户数据平台营销费用库，包含活动管理、优惠券系统、任务系统（签到/游戏）、核销码、批次管理等模块。158个活动、121种优惠券、155个任务',
    sampleContent: `-- 活动表 (158行)
CREATE TABLE activity (
  id bigint PRIMARY KEY,
  uuid varchar(255) NOT NULL COMMENT '活动唯一标识',
  activity_name varchar(255) COMMENT '活动名称',
  activity_number varchar(255) COMMENT '活动编号',
  activity_cost decimal(38,2) COMMENT '活动费用',
  activity_enabled bit(1) COMMENT '是否启用',
  begin_time datetime COMMENT '开始时间',
  end_time datetime COMMENT '结束时间',
  max_join bigint COMMENT '最大参与次数',
  max_join_daily bigint COMMENT '每日最大参与次数',
  can_refund bit(1) COMMENT '允许退款',
  can_tag bit(1) COMMENT '允许打标',
  b_online bit(1) COMMENT '是否上线',
  is_delete bit(1) COMMENT '是否删除'
);

-- 优惠券表 (121行)
CREATE TABLE coupon (
  id bigint PRIMARY KEY,
  uuid varchar(255) NOT NULL COMMENT '优惠券唯一标识',
  coupon_name varchar(255) COMMENT '优惠券名称',
  coupon_number varchar(255) COMMENT '优惠券编号',
  coupon_price decimal(38,2) COMMENT '券面值',
  coupon_threshold decimal(38,2) COMMENT '使用门槛金额',
  coupon_enabled bit(1) COMMENT '是否启用',
  coupon_remarks varchar(1024) COMMENT '券说明',
  rule_text varchar(1024) COMMENT '使用规则',
  begin_time datetime COMMENT '生效时间',
  end_time datetime COMMENT '失效时间',
  period_type varchar(255) COMMENT '有效期类型',
  once_pick_up_quantity int COMMENT '单次领取数量',
  can_gift bit(1) COMMENT '允许转赠',
  audit_status varchar(255) COMMENT '审核状态',
  audit_time datetime COMMENT '审核时间',
  coupon_reviewer varchar(255) COMMENT '审核人',
  refund_return_code bit(1) COMMENT '退款返还码',
  show_validity bigint COMMENT '展示有效期'
);

-- 任务表 (155行, 签到/游戏/互动任务)
CREATE TABLE mission (
  id bigint PRIMARY KEY,
  uuid varchar(255) NOT NULL COMMENT '任务唯一标识',
  mission_name varchar(255) COMMENT '任务名称',
  mission_number varchar(255) COMMENT '任务编号',
  mission_enabled bit(1) COMMENT '是否启用',
  begin_time datetime COMMENT '开始时间',
  end_time datetime COMMENT '结束时间',
  preheat_time datetime COMMENT '预热时间',
  channel_id varchar(255) COMMENT '渠道ID',
  max_join bigint COMMENT '最大完成次数',
  max_join_daily bigint COMMENT '每日最大完成次数',
  process_all int COMMENT '总进度',
  b_online bit(1) COMMENT '是否上线',
  is_delete bit(1) COMMENT '是否删除'
);

-- 任务奖励表 (310行)
CREATE TABLE mission_award (
  id bigint PRIMARY KEY,
  mission_id varchar(255) COMMENT '关联任务ID',
  award_type varchar(255) COMMENT '奖励类型(POINTS/COUPON/BADGE)',
  award_value varchar(255) COMMENT '奖励值',
  award_quantity int COMMENT '奖励数量'
);

-- 核销码表 (728行)
CREATE TABLE code (
  id bigint PRIMARY KEY,
  code varchar(255) COMMENT '核销码',
  activity_id varchar(255) COMMENT '关联活动ID',
  status varchar(255) COMMENT '状态(UNUSED/USED/EXPIRED)',
  used_time datetime COMMENT '核销时间',
  used_by varchar(255) COMMENT '核销人',
  batch_id varchar(255) COMMENT '批次ID'
);

-- 批次表 (151行)
CREATE TABLE batch (
  id bigint PRIMARY KEY,
  batch_name varchar(255) COMMENT '批次名称',
  batch_number varchar(255) COMMENT '批次编号',
  activity_id varchar(255) COMMENT '关联活动ID',
  total_count int COMMENT '总数量',
  used_count int COMMENT '已使用数量',
  status varchar(255) COMMENT '状态'
);

-- 签到记录表
CREATE TABLE sign_in_history (
  id bigint PRIMARY KEY,
  member_id varchar(255) COMMENT '会员ID',
  sign_in_date date COMMENT '签到日期',
  continuous_days int COMMENT '连续签到天数',
  award_points int COMMENT '奖励积分'
);

-- 游戏参与记录 (964行)
CREATE TABLE mission_game_join_history (
  id bigint PRIMARY KEY,
  mission_id varchar(255) COMMENT '任务ID',
  member_id varchar(255) COMMENT '会员ID',
  join_time datetime COMMENT '参与时间',
  result varchar(255) COMMENT '游戏结果',
  award_content varchar(255) COMMENT '获得奖励'
);`
  },

  point: {
    name: '绿城CDP 积分库 (lvchengcdp_point)',
    type: 'Database',
    auth_mode: 'JWT',
    description: '绿城客户数据平台积分库，包含积分余额、积分规则、积分扣减、积分历史等。631个积分账户、1290条积分变动记录',
    sampleContent: `-- 积分余额表 (631行)
CREATE TABLE balance (
  id bigint PRIMARY KEY,
  uuid varchar(255) NOT NULL COMMENT '余额唯一标识',
  user_id varchar(255) COMMENT '会员ID',
  account varchar(255) COMMENT '积分账户',
  balance decimal(38,2) COMMENT '当前余额',
  total decimal(38,2) COMMENT '累计积分',
  version bigint COMMENT '版本号(乐观锁)'
);

-- 积分历史表 (1290行)
CREATE TABLE history (
  id bigint PRIMARY KEY,
  uuid varchar(255) COMMENT '记录唯一标识',
  user_id varchar(255) COMMENT '会员ID',
  change_type varchar(255) COMMENT '变动类型(EARN/REDEEM/EXPIRE)',
  change_amount decimal(38,2) COMMENT '变动积分数',
  balance_after decimal(38,2) COMMENT '变动后余额',
  source varchar(255) COMMENT '积分来源(ORDER/SIGN_IN/ACTIVITY)',
  source_id varchar(255) COMMENT '来源ID',
  remark varchar(255) COMMENT '备注',
  created_time datetime COMMENT '变动时间'
);

-- 积分规则表
CREATE TABLE bloc_rule (
  id bigint PRIMARY KEY,
  bloc_id varchar(255) COMMENT '集团ID',
  rule_name varchar(255) COMMENT '规则名称',
  rule_type varchar(255) COMMENT '规则类型(EARN_RATE/REDEEM_RATE)',
  rate decimal(10,4) COMMENT '比率',
  min_points int COMMENT '最低积分',
  max_points int COMMENT '最高积分',
  enabled bit(1) COMMENT '是否启用'
);

-- 积分扣减表
CREATE TABLE deduction (
  id bigint PRIMARY KEY,
  user_id varchar(255) COMMENT '会员ID',
  deduction_amount decimal(38,2) COMMENT '扣减积分数',
  deduction_type varchar(255) COMMENT '扣减类型(REDEEM/EXPIRE)',
  target_id varchar(255) COMMENT '兑换目标ID(优惠券/商品)',
  created_time datetime COMMENT '扣减时间'
);

-- 积分历史扩展信息
CREATE TABLE history_ext_info (
  id bigint PRIMARY KEY,
  history_id varchar(255) COMMENT '关联历史记录ID',
  ext_key varchar(255) COMMENT '扩展字段名',
  ext_value varchar(255) COMMENT '扩展字段值'
);`
  },

  maindata: {
    name: '绿城CDP 主数据库 (lvchengcdp_cdpmaindata)',
    type: 'Database',
    auth_mode: 'Basic Auth',
    description: '绿城客户数据平台主数据库，包含商城信息(59个)、门店信息(73个)、集团信息、品牌、业态分类、楼层、终端等基础数据',
    sampleContent: `-- 商城信息表 (59行)
CREATE TABLE mall_info (
  id bigint PRIMARY KEY,
  uuid varchar(255) NOT NULL COMMENT '商城唯一标识',
  mall_id varchar(255) COMMENT '商城ID',
  mall_name varchar(255) COMMENT '商城名称',
  mall_no varchar(255) COMMENT '商城编号',
  bloc_id varchar(255) COMMENT '所属集团ID',
  bloc_name varchar(255) COMMENT '所属集团名称',
  bloc_uuid varchar(255) COMMENT '集团UUID',
  city varchar(255) COMMENT '所在城市',
  address varchar(255) COMMENT '详细地址',
  jhi_desc varchar(255) COMMENT '描述',
  enabled bit(1) COMMENT '是否启用',
  out_mall_id varchar(255) COMMENT '外部商城ID',
  out_mall_name varchar(255) COMMENT '外部商城名称'
);

-- 门店信息表 (73行)
CREATE TABLE store_info (
  id bigint PRIMARY KEY,
  uuid varchar(255) NOT NULL COMMENT '门店唯一标识',
  store_id varchar(255) COMMENT '门店ID',
  store_name varchar(255) COMMENT '门店名称',
  store_no varchar(255) COMMENT '门店编号',
  mall_id varchar(255) COMMENT '所属商城ID',
  mall_name varchar(255) COMMENT '所属商城名称',
  bloc_id varchar(255) COMMENT '所属集团ID',
  bloc_name varchar(255) COMMENT '集团名称',
  brand_id varchar(255) COMMENT '品牌ID',
  brand_code varchar(255) COMMENT '品牌编码',
  business_type_id varchar(255) COMMENT '业态ID',
  business_type_name varchar(255) COMMENT '业态名称',
  second_type_id varchar(255) COMMENT '二级业态ID',
  second_type_name varchar(255) COMMENT '二级业态名称',
  address_desc varchar(255) COMMENT '地址描述',
  floor varchar(255) COMMENT '楼层',
  open_time varchar(255) COMMENT '营业时间',
  customer_price decimal(21,2) COMMENT '客单价',
  score decimal(21,2) COMMENT '评分',
  show_name varchar(255) COMMENT '展示名称',
  sort_weight int COMMENT '排序权重',
  enabled bit(1) COMMENT '是否启用',
  overhead bit(1) COMMENT '是否高架',
  logo varchar(255) COMMENT 'Logo',
  image_1 varchar(255) COMMENT '图片1',
  out_store_id varchar(255) COMMENT '外部门店ID',
  out_store_name varchar(255) COMMENT '外部门店名称',
  out_store_no varchar(255) COMMENT '外部门店编号'
);

-- 集团信息表 (4行)
CREATE TABLE bloc_info (
  id bigint PRIMARY KEY,
  uuid varchar(255) NOT NULL COMMENT '集团唯一标识',
  bloc_id varchar(255) COMMENT '集团ID',
  bloc_name varchar(255) COMMENT '集团名称',
  city varchar(255) COMMENT '所在城市',
  address varchar(255) COMMENT '地址',
  enabled bit(1) COMMENT '是否启用'
);

-- 业态分类表 (9行)
CREATE TABLE business_type (
  id bigint PRIMARY KEY,
  type_name varchar(255) COMMENT '业态名称',
  type_code varchar(255) COMMENT '业态编码',
  parent_id varchar(255) COMMENT '父级ID',
  sort_weight int COMMENT '排序权重',
  enabled bit(1) COMMENT '是否启用'
);

-- 二级业态表 (24行)
CREATE TABLE second_type (
  id bigint PRIMARY KEY,
  type_name varchar(255) COMMENT '二级业态名称',
  type_code varchar(255) COMMENT '二级业态编码',
  business_type_id varchar(255) COMMENT '关联一级业态ID',
  sort_weight int COMMENT '排序权重'
);

-- 商城业态关联表 (63行)
CREATE TABLE mall_business_type (
  id bigint PRIMARY KEY,
  mall_id varchar(255) COMMENT '商城ID',
  business_type_id varchar(255) COMMENT '业态ID',
  sort_weight int COMMENT '排序权重'
);`
  },

  auth: {
    name: '绿城CDP 认证权限库 (lvchengcdp_auth)',
    type: 'REST API',
    auth_mode: 'OAuth',
    description: '绿城客户数据平台认证授权库，基于 RBAC 模型实现多租户权限管理。162个账户、49个角色、132个权限项、支持数据权限隔离',
    sampleContent: `-- 账户信息表 (162行)
CREATE TABLE account_info (
  id bigint PRIMARY KEY,
  uuid varchar(255) NOT NULL COMMENT '账户唯一标识',
  username varchar(255) COMMENT '用户名',
  display_name varchar(255) COMMENT '显示名',
  mobile varchar(255) COMMENT '手机号',
  e_mail varchar(255) COMMENT '邮箱',
  password varchar(255) COMMENT '密码(加密)',
  enabled bit(1) COMMENT '是否启用',
  tenant_id varchar(255) COMMENT '租户ID',
  last_login_time datetime COMMENT '最后登录时间'
);

-- 角色信息表 (49行)
CREATE TABLE role_info (
  id bigint PRIMARY KEY,
  uuid varchar(255) NOT NULL COMMENT '角色唯一标识',
  role_name varchar(255) COMMENT '角色名称',
  role_code varchar(255) COMMENT '角色编码',
  role_desc varchar(255) COMMENT '角色描述',
  enabled bit(1) COMMENT '是否启用',
  tenant_id varchar(255) COMMENT '租户ID'
);

-- 权限信息表 (132行)
CREATE TABLE authority_info (
  id bigint PRIMARY KEY,
  uuid varchar(255) NOT NULL COMMENT '权限唯一标识',
  authority_name varchar(255) COMMENT '权限名称',
  authority_code varchar(255) COMMENT '权限编码',
  authority_type varchar(255) COMMENT '权限类型(MENU/BUTTON/API)',
  parent_id varchar(255) COMMENT '父级权限ID',
  path varchar(255) COMMENT '路由路径',
  component varchar(255) COMMENT '前端组件',
  icon varchar(255) COMMENT '图标',
  sort_weight int COMMENT '排序权重',
  enabled bit(1) COMMENT '是否启用'
);

-- 账户-角色关联表 (201行)
CREATE TABLE rel_account_info__role_info (
  id bigint PRIMARY KEY,
  account_id varchar(255) COMMENT '账户ID',
  role_id varchar(255) COMMENT '角色ID'
);

-- 角色-权限关联表 (663行)
CREATE TABLE rel_role_info__authority_info (
  id bigint PRIMARY KEY,
  role_id varchar(255) COMMENT '角色ID',
  authority_id varchar(255) COMMENT '权限ID'
);

-- 数据权限表 (32行)
CREATE TABLE role_dataperm_info (
  id bigint PRIMARY KEY,
  role_id varchar(255) COMMENT '角色ID',
  scope_type varchar(255) COMMENT '范围类型(BLOC/MALL/STORE)',
  scope_value varchar(255) COMMENT '范围值ID'
);

-- 账户数据权限值表 (182行)
CREATE TABLE account_scope_value (
  id bigint PRIMARY KEY,
  account_id varchar(255) COMMENT '账户ID',
  scope_type varchar(255) COMMENT '范围类型',
  scope_value varchar(255) COMMENT '范围值'
);`
  }
};

/**
 * 将绿城 DDL 样本作为数据源种子注入系统
 */
export function getLvchengSeedSources() {
  return Object.entries(LVCHENG_DDL_SAMPLES).map(([key, val]) => ({
    id: `ds_lvcheng_${key}`,
    name: val.name,
    type: val.type,
    auth_mode: val.auth_mode,
    description: val.description,
    sampleContent: val.sampleContent,
    project_id: 'proj_lvcheng_cdp'
  }));
}
