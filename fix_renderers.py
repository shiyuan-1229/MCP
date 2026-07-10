import re

src = r'D:\桌面\mcp方案\mcp\poc\admin\assets\modules\renderers.js'

with open(src, 'r', encoding='utf-8') as f:
    s = f.read()

replacements = [
    ("const billingText = { confirmed: '已确�?, pending: '待确�?, overdue: '已��期', none: '无记�? };",
     "const billingText = { confirmed: '已确认', pending: '待确认', overdue: '已逾期', none: '无记录' };"),
    ("""const sortOptions = [
  { value: 'milestone-asc', label: '按里程碑朢��? },
  { value: 'health-risk-first', label: '按健康风�? },
  { value: 'exceptions-desc', label: '按调用异�? },
  { value: 'certificate-asc', label: '按证书到�? },
  { value: 'release-desc', label: '按最近发�? },
  { value: 'progress-desc', label: '按进度最�? }
];""",
     """const sortOptions = [
  { value: 'milestone-asc', label: '按里程碑最近优先' },
  { value: 'health-risk-first', label: '按健康风险优先' },
  { value: 'exceptions-desc', label: '按调用异常最多' },
  { value: 'certificate-asc', label: '按证书到期最近' },
  { value: 'release-desc', label: '按最近发布' },
  { value: 'progress-desc', label: '按进度最高' }
];"""),
]

for old, new in replacements:
    if old in s:
        s = s.replace(old, new)
        print('fixed:', old[:50])
    else:
        print('not found:', old[:50])

with open(src, 'w', encoding='utf-8') as f:
    f.write(s)
