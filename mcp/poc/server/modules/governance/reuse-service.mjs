// governance/reuse-service.mjs
// 复用推荐：基于业务域匹配 + 名称词重叠打分。
// 评分规则（来自 docs/superpowers/specs/...governance-design.md）：
//   - 业务域命中：+0.6
//   - 名称词重叠：每次 +0.2，最多 +0.4
//   - 总分范围：0 ~ 1，越高表示越值得复用
//
// 分类（Builder Workbench MVP Task 5）：
//   - score >= 0.8 → direct_reuse  （直接复用）
//   - score >= 0.4 → adapt_reuse   （复制后改造）
//   - 其余            → suggest_new  （建议新建）

function similarityScore(candidate, asset) {
  let score = 0;
  if (candidate.business_domain && candidate.business_domain === asset.business_domain) {
    score += 0.6;
  }
  const candidateWords = String(candidate.name || '').toLowerCase().split(/\s+/).filter(Boolean);
  const assetWords = String(asset.name || '').toLowerCase().split(/\s+/).filter(Boolean);
  const overlap = candidateWords.filter(word => assetWords.includes(word)).length;
  score += Math.min(0.4, overlap * 0.2);
  return Number(score.toFixed(2));
}

function classifyReuse(score) {
  if (score >= 0.8) return 'direct_reuse';
  if (score >= 0.4) return 'adapt_reuse';
  return 'suggest_new';
}

function reasonFor(category, candidate, asset) {
  if (category === 'direct_reuse') {
    return '业务域一致 + 名称高度重叠，可直接挂接现有资产';
  }
  if (category === 'adapt_reuse') {
    if (candidate.business_domain === asset.business_domain) {
      return '业务域一致，建议复制后改造参数 / 权限 / 边界';
    }
    return '名称相似度高，建议参考该资产并按本项目业务域改造';
  }
  return '业务域与名称都不匹配，建议新建资产';
}

export function suggestReuse({ candidate, publishedAssets = [] }) {
  return publishedAssets
    .map(asset => {
      const score = similarityScore(candidate, asset);
      const category = classifyReuse(score);
      return {
        published_asset_id: asset.id,
        score,
        reuse_category: category,
        suggestion_reason: reasonFor(category, candidate, asset)
      };
    })
    .sort((a, b) => b.score - a.score);
}

export const REUSE_CATEGORY_TEXT = {
  direct_reuse: '直接复用',
  adapt_reuse: '复制后改造',
  suggest_new: '建议新建'
};