// governance/repository.mjs
// 封装 governance 业务表的读写。提供 list / 单条查询 / 决策持久化 / 发布 / 复用推荐存储 / 人工卡点。

import { REUSE_CATEGORY_TEXT } from './reuse-service.mjs';
import { canRecordRetro, summarizeRetro } from './retro-service.mjs';
import { detectBoundaryConflict } from './boundary-detector.mjs';
import { REVIEW_STAGES } from './review-stages.mjs';
import crypto from 'node:crypto';

function safeParseJson(value) {
  if (Array.isArray(value)) return value;
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

export function createGovernanceRepository(db) {
  return {
    // ---- candidates ----
    listCandidates() {
      return db.prepare("SELECT * FROM platform_candidate_assets ORDER BY created_at DESC").all();
    },
    getCandidate(id) {
      return db.prepare("SELECT * FROM platform_candidate_assets WHERE id = ?").get(id) || null;
    },
    insertCandidate(c) {
      db.prepare(`INSERT INTO platform_candidate_assets
        (id, project_id, source_type, source_ref, name, business_domain, confidence, risk_level, sensitive_hits, mapping_status, ai_summary, raw_payload, status, needs_human_review)
        VALUES (@id, @project_id, @source_type, @source_ref, @name, @business_domain, @confidence, @risk_level, @sensitive_hits, @mapping_status, @ai_summary, @raw_payload, @status, @needs_human_review)`)
        .run({
          ...c,
          needs_human_review: c.needs_human_review ? 1 : 0
        });
      return this.getCandidate(c.id);
    },
    updateManualScreen({ id, decision, reason, by }) {
      const result = db.prepare(`UPDATE platform_candidate_assets
        SET manual_screen_status = ?, manual_screen_decision = ?, manual_screen_reason = ?, manual_screen_by = ?, manual_screen_at = datetime('now')
        WHERE id = ?`).run(decision, decision, reason, by || '', id);
      return result.changes > 0;
    },
    updateAcceptance({ id, passed, checklist, by, blockReason }) {
      const result = db.prepare(`UPDATE platform_candidate_assets
        SET acceptance_passed = ?, acceptance_checklist = ?, acceptance_by = ?, acceptance_at = datetime('now'), publish_block_reason = ?
        WHERE id = ?`).run(
        passed ? 1 : 0,
        JSON.stringify(checklist || {}),
        by || '',
        blockReason || '',
        id
      );
      return result.changes > 0;
    },

    // ---- review tasks ----
    listReviewTasks(stage) {
      if (stage) {
        return db.prepare("SELECT * FROM platform_review_tasks WHERE review_stage = ? ORDER BY created_at DESC").all(stage);
      }
      return db.prepare("SELECT * FROM platform_review_tasks ORDER BY created_at DESC").all();
    },
    getReviewTask(id) {
      return db.prepare("SELECT * FROM platform_review_tasks WHERE id = ?").get(id) || null;
    },
    saveReviewTasks(tasks) {
      if (!tasks.length) return;
      const stmt = db.prepare(`INSERT INTO platform_review_tasks
        (id, candidate_id, review_stage, review_type, review_reason, assignee_role, status)
        VALUES (@id, @candidate_id, @review_stage, @review_type, @review_reason, @assignee_role, 'open')`);
      const tx = db.transaction(items => items.forEach(item => {
        stmt.run({
          ...item,
          review_stage: item.review_stage || REVIEW_STAGES.CANDIDATE
        });
      }));
      tx(tasks);
    },
    recordReviewDecision({ reviewId, decision, reason }) {
      // modify 决策特殊处理：status 设为 'modified' 而非 'resolved'
      const status = decision === 'modify' ? 'modified' : 'resolved';
      const result = db.prepare(`UPDATE platform_review_tasks
        SET status = ?, decision = ?, decision_reason = ?, resolved_at = datetime('now')
        WHERE id = ?`).run(status, decision, reason, reviewId);
      return result.changes > 0;
    },
    // 记录修改内容（modify 决策时调用），保留 AI 原判断与人工修正对照
    recordModification({ reviewId, candidateId, modifiedFields, modifyReason, modifiedBy }) {
      const id = `mod_${crypto.randomBytes(5).toString('hex')}`;
      db.prepare(`INSERT INTO platform_modification_logs
        (id, candidate_id, review_task_id, modified_fields_json, modify_reason, modified_by)
        VALUES (?, ?, ?, ?, ?, ?)`).run(
        id, candidateId, reviewId,
        JSON.stringify(modifiedFields || {}),
        modifyReason || '', modifiedBy || ''
      );
      return id;
    },
    // 修改后重审：回到对应审核阶段创建新的 open 任务
    createResubmitTask({ candidateId, stage, reviewType, reason, assigneeRole, parentTaskId }) {
      const id = `rev_${crypto.randomBytes(5).toString('hex')}`;
      db.prepare(`INSERT INTO platform_review_tasks
        (id, candidate_id, review_stage, review_type, review_reason, assignee_role, status, parent_task_id)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`).run(
        id, candidateId, stage,
        reviewType || 'resubmit_review', reason,
        assigneeRole || 'developer', parentTaskId || null
      );
      return db.prepare("SELECT * FROM platform_review_tasks WHERE id = ?").get(id);
    },
    // 手动创建审核任务（人工触发）
    createManualReviewTask({ candidateId, stage, reviewType, reason, assigneeRole, triggerSource }) {
      const id = `rev_${crypto.randomBytes(5).toString('hex')}`;
      db.prepare(`INSERT INTO platform_review_tasks
        (id, candidate_id, review_stage, review_type, review_reason, assignee_role, status)
        VALUES (?, ?, ?, ?, ?, ?, 'open')`).run(
        id, candidateId, stage || REVIEW_STAGES.CANDIDATE,
        reviewType || 'manual_review', reason,
        assigneeRole || 'developer'
      );
      return db.prepare("SELECT * FROM platform_review_tasks WHERE id = ?").get(id);
    },
    // 升级审核：创建一个 escalated_review 任务
    escalateReviewTask({ candidateId, nextStage, nextReviewType, nextAssignee, reason }) {
      const id = `rev_${crypto.randomBytes(5).toString('hex')}`;
      db.prepare(`INSERT INTO platform_review_tasks
        (id, candidate_id, review_stage, review_type, review_reason, assignee_role, status)
        VALUES (?, ?, ?, ?, ?, ?, 'open')`).run(
        id, candidateId, nextStage,
        nextReviewType || 'escalated_review', reason,
        nextAssignee || 'senior_reviewer'
      );
      return db.prepare("SELECT * FROM platform_review_tasks WHERE id = ?").get(id);
    },
    listOpenReviewTasksForCandidate(candidateId, stage) {
      if (stage) {
        return db.prepare("SELECT * FROM platform_review_tasks WHERE candidate_id = ? AND review_stage = ? AND status = 'open'").all(candidateId, stage);
      }
      return db.prepare("SELECT * FROM platform_review_tasks WHERE candidate_id = ? AND status = 'open'").all(candidateId);
    },
    // 获取候选资产在各阶段的审核状态汇总
    getReviewStageSummary(candidateId) {
      const tasks = db.prepare("SELECT review_stage, status, decision FROM platform_review_tasks WHERE candidate_id = ?").all(candidateId);
      const stages = {};
      for (const t of tasks) {
        if (!stages[t.review_stage]) {
          stages[t.review_stage] = { total: 0, open: 0, resolved: 0, rejected: 0 };
        }
        stages[t.review_stage].total++;
        if (t.status === 'open') stages[t.review_stage].open++;
        if (t.status === 'resolved') {
          stages[t.review_stage].resolved++;
          if (t.decision === 'reject') stages[t.review_stage].rejected++;
        }
      }
      return stages;
    },

    // 检查候选资产发布前门禁状态
    checkCandidatePublishReadiness(candidateId) {
      const candidate = this.getCandidate(candidateId);
      if (!candidate) return { canPublish: false, blockedReason: 'candidate not found' };
      
      const gateResult = checkPublishGate(candidate);
      const formattedResult = formatPublishGateResult(gateResult);
      
      return {
        canPublish: formattedResult.canPublish,
        blockedReason: formattedResult.blockedReason,
        gateResult: gateResult
      };
    },

    // ---- published assets ----
    listPublishedAssets() {
      return db.prepare("SELECT * FROM platform_published_assets ORDER BY published_at DESC").all();
    },
    publishCandidate({ candidate, publishedBy }) {
      const id = (candidate.id || '').replace(/^cand_/, 'pub_') || `pub_${Date.now().toString(36)}`;
      db.prepare(`INSERT INTO platform_published_assets
        (id, candidate_id, project_id, name, business_domain, asset_payload, published_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, candidate.id, candidate.project_id, candidate.name, candidate.business_domain, candidate.raw_payload, publishedBy || '');
      db.prepare(`UPDATE platform_candidate_assets SET status = 'published', publish_block_reason = NULL WHERE id = ?`).run(candidate.id);
      return db.prepare("SELECT * FROM platform_published_assets WHERE id = ?").get(id);
    },

    // ---- reuse suggestions ----
    listReuseSuggestions() {
      return db.prepare("SELECT * FROM platform_reuse_suggestions ORDER BY created_at DESC").all();
    },
    saveReuseSuggestions({ candidateId, projectId, suggestions }) {
      if (!suggestions.length) return;
      const stmt = db.prepare(`INSERT INTO platform_reuse_suggestions
        (id, project_id, candidate_id, published_asset_id, score, suggestion_reason)
        VALUES (?, ?, ?, ?, ?, ?)`);
      const tx = db.transaction(items => {
        items.forEach((item, index) => stmt.run(`reuse_${candidateId}_${index}`, projectId, candidateId, item.published_asset_id, item.score, item.suggestion_reason || item.reuse_category || ''));
      });
      tx(suggestions);
    },

    // ---- builder value metrics ----
    // 为 admin 总览页计算 B 端价值指标
    builderMetrics() {
      const totalCandidates = db.prepare("SELECT COUNT(*) AS c FROM platform_candidate_assets").get().c;
      const totalPublished = db.prepare("SELECT COUNT(*) AS c FROM platform_published_assets").get().c;
      const pendingPublishes = db.prepare("SELECT COUNT(*) AS c FROM platform_candidate_assets WHERE acceptance_passed = 1 AND status != 'published'").get().c;
      const pendingManualScreen = db.prepare("SELECT COUNT(*) AS c FROM platform_candidate_assets WHERE manual_screen_status = 'pending'").get().c;
      const humanReviewHits = db.prepare("SELECT COUNT(*) AS c FROM platform_candidate_assets WHERE needs_human_review = 1").get().c;
      const publishedAssets = db.prepare("SELECT COUNT(*) AS c FROM platform_published_assets").get().c;

      // 7 天内复用建议数
      const weekReuses = db.prepare(
        "SELECT COUNT(*) AS c FROM platform_reuse_suggestions WHERE created_at >= datetime('now', '-7 days')"
      ).get().c;

      // 平均打造周期：从候选到发布（小时）
      const cycleRow = db.prepare(`
        SELECT AVG((julianday(p.published_at) - julianday(c.created_at)) * 24) AS hours
        FROM platform_published_assets p
        JOIN platform_candidate_assets c ON c.id = p.candidate_id
      `).get();
      const avgBuildCycleHours = cycleRow?.hours ? Number(cycleRow.hours.toFixed(1)) : 0;

      // 通过率：发布数 / (发布数 + 候选被拒数)
      const rejected = db.prepare("SELECT COUNT(*) AS c FROM platform_candidate_assets WHERE manual_screen_decision = 'reject'").get().c;
      const decided = totalPublished + rejected;
      const passRate = decided > 0 ? Number((totalPublished / decided).toFixed(2)) : 0;

      // 复用率：复用建议中 direct_reuse 占比
      const reuseByCategory = db.prepare(
        `SELECT suggestion_reason AS category, COUNT(*) AS c
         FROM platform_reuse_suggestions
         WHERE suggestion_reason IN ('${Object.keys(REUSE_CATEGORY_TEXT || {}).join("','")}')
         GROUP BY suggestion_reason`
      ).all();
      const reuseBreakdown = {};
      for (const row of reuseByCategory) reuseBreakdown[row.category] = row.c;
      const totalReuse = reuseByCategory.reduce((s, r) => s + r.c, 0);
      const reuseRate = totalReuse > 0 && publishedAssets > 0
        ? Number((reuseByCategory.find(r => r.category === 'direct_reuse')?.c || 0) / publishedAssets).toFixed(2)
        : 0;

      return {
        total_candidates: totalCandidates,
        total_published: totalPublished,
        pending_publishes: pendingPublishes,
        pending_manual_screen: pendingManualScreen,
        human_review_hits: humanReviewHits,
        week_reuses: weekReuses,
        avg_build_cycle_hours: avgBuildCycleHours,
        pass_rate: passRate,
        reuse_rate: Number(reuseRate),
        reuse_breakdown: reuseBreakdown,
        reuse_category_text: REUSE_CATEGORY_TEXT,
        generated_at: new Date().toISOString()
      };
    },

    // ---- retro（误识别复盘）----
    // 给某个候选记录一条复盘原因（仅当 decision = reject/modify 时允许）
    recordRetro({ id, reason, note, by }) {
      const candidate = this.getCandidate(id);
      if (!candidate) return { ok: false, error: 'candidate not found' };
      if (!canRecordRetro(candidate)) {
        return { ok: false, error: '只有 reject / modify 的候选才能记录复盘' };
      }
      const result = db.prepare(`UPDATE platform_candidate_assets
        SET retro_reason = ?, retro_note = ?, retro_recorded_by = ?, retro_recorded_at = datetime('now')
        WHERE id = ?`).run(reason, note || '', by || '', id);
      return { ok: result.changes > 0, candidate: this.getCandidate(id) };
    },
    // 汇总当前所有候选的复盘原因
    retroSummary() {
      const rows = db.prepare(
        "SELECT retro_reason FROM platform_candidate_assets WHERE retro_reason IS NOT NULL AND retro_reason != ''"
      ).all();
      const summary = summarizeRetro(rows);
      return {
        ...summary,
        total_retros: summary.total
      };
    },

    // ---- Tool 打造工作台（Task 3）----
    // 保存 AI 原建议 + 人工修订后的 tools 版本（含业务规则）
    saveToolBuild({ id, aiTools, humanTools, businessRules, by }) {
      const candidate = this.getCandidate(id);
      if (!candidate) return { ok: false, error: 'candidate not found' };

      // 检测边界冲突
      const boundary = detectBoundaryConflict(humanTools || aiTools || []);
      const boundaryWarning = boundary.warnings.length
        ? JSON.stringify(boundary.warnings)
        : '';

      db.prepare(`UPDATE platform_candidate_assets
        SET ai_tools_snapshot = ?, human_tools_snapshot = ?, business_rule_notes = ?, boundary_warning = ?, built_by = ?, built_at = datetime('now')
        WHERE id = ?`).run(
        JSON.stringify(aiTools || []),
        JSON.stringify(humanTools || []),
        businessRules || '',
        boundaryWarning,
        by || '',
        id
      );
      return {
        ok: true,
        candidate: this.getCandidate(id),
        boundary_conflict: boundary.has_conflict,
        boundary_warnings: boundary.warnings
      };
    },
    getToolSnapshots(id) {
      const candidate = this.getCandidate(id);
      if (!candidate) return null;
      let boundaryWarnings = [];
      try { boundaryWarnings = candidate.boundary_warning ? JSON.parse(candidate.boundary_warning) : []; } catch {}
      return {
        candidate_id: id,
        ai_tools: safeParseJson(candidate.ai_tools_snapshot),
        human_tools: safeParseJson(candidate.human_tools_snapshot),
        business_rule_notes: candidate.business_rule_notes || '',
        boundary_warnings: boundaryWarnings,
        built_by: candidate.built_by || '',
        built_at: candidate.built_at || ''
      };
    }
  };
}