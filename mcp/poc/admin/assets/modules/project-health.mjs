const healthPriority = { risk: 0, attention: 1, healthy: 2, unknown: 3 };

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function toTime(value) {
  if (!value) return 0;
  const normalized = String(value).replace(' ', 'T');
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : 0;
}

function toDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'));
}

function billingStatusForCustomer(records) {
  const statuses = records.map(item => item.status).filter(Boolean);
  if (!statuses.length) return 'none';
  if (statuses.includes('overdue')) return 'overdue';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.includes('confirmed')) return 'confirmed';
  return statuses[0];
}

function healthStatusFor(row) {
  const failedHealth = row.accessItems.some(item => item.last_health_status === 'error');
  const expiredCert = row.certificateDaysLeft != null && row.certificateDaysLeft < 0;
  if (failedHealth || expiredCert || row.callExceptionCount >= 2) return 'risk';
  const expiringCert = row.certificateDaysLeft != null && row.certificateDaysLeft <= 30;
  if (expiringCert || row.callExceptionCount > 0 || row.billingStatus === 'pending' || row.stage !== 'published') return 'attention';
  return 'healthy';
}

function buildProjectRow(project, data, now) {
  const assets = asList(data.assets).filter(asset => asset.project_id === project.id);
  const assetIds = new Set(assets.map(asset => asset.id));
  const assetNames = new Set(assets.map(asset => asset.name));
  const releases = asList(data.releases)
    .filter(release => assetIds.has(release.asset_id) || assetNames.has(release.asset_name))
    .sort((a, b) => toTime(b.released_at || b.tested_at) - toTime(a.released_at || a.tested_at));
  const accessItems = asList(data.access).filter(item => item.project_id === project.id);
  const certificateDates = accessItems
    .map(item => item.credential_expires_at)
    .filter(Boolean)
    .sort((a, b) => toTime(a) - toTime(b));
  const certificateExpiryRaw = certificateDates[0] || '';
  const certificateDaysLeft = certificateExpiryRaw
    ? Math.ceil((toTime(certificateExpiryRaw) - now.getTime()) / 86400000)
    : null;
  const events = asList(data.events).filter(event => assetNames.has(event.asset_name) || assetIds.has(event.asset_id));
  const billingRecords = asList(data.billing).filter(item => item.customer_id === project.customer_id || item.customer_name === project.customer_name);
  const billingStatus = billingStatusForCustomer(billingRecords);
  const row = {
    projectId: project.id,
    customerId: project.customer_id,
    customerName: project.customer_name || '',
    projectName: project.name || '',
    stage: project.stage || '',
    owner: project.owner || '',
    progress: Number(project.progress || 0),
    milestone: project.due_date || '',
    environments: uniq(accessItems.map(item => item.environment || 'production')),
    recentRelease: releases[0] || null,
    certificateExpiry: toDate(certificateExpiryRaw),
    certificateDaysLeft,
    callExceptionCount: events.filter(event => event.status === 'error').length,
    billingStatus,
    accessItems
  };
  return { ...row, healthStatus: healthStatusFor(row) };
}

function matchesFilter(row, filters) {
  const customer = filters.customer || 'all';
  const stage = filters.stage || 'all';
  const environment = filters.environment || 'all';
  const owner = filters.owner || 'all';
  const healthStatus = filters.healthStatus || 'all';
  return (customer === 'all' || row.customerId === customer || row.customerName === customer)
    && (stage === 'all' || row.stage === stage)
    && (environment === 'all' || row.environments.includes(environment))
    && (owner === 'all' || row.owner === owner)
    && (healthStatus === 'all' || row.healthStatus === healthStatus);
}

function sortRows(rows, sortBy) {
  const sorted = [...rows];
  const sortMode = sortBy || 'milestone-asc';
  sorted.sort((a, b) => {
    if (sortMode === 'progress-desc') return b.progress - a.progress;
    if (sortMode === 'release-desc') return toTime(b.recentRelease?.released_at || b.recentRelease?.tested_at) - toTime(a.recentRelease?.released_at || a.recentRelease?.tested_at);
    if (sortMode === 'certificate-asc') return (toTime(a.certificateExpiry) || Number.MAX_SAFE_INTEGER) - (toTime(b.certificateExpiry) || Number.MAX_SAFE_INTEGER);
    if (sortMode === 'exceptions-desc') return b.callExceptionCount - a.callExceptionCount;
    if (sortMode === 'health-risk-first') return healthPriority[a.healthStatus] - healthPriority[b.healthStatus];
    return toTime(a.milestone) - toTime(b.milestone);
  });
  return sorted;
}

export function buildProjectHealthRows(data = {}, filters = {}) {
  const now = new Date(data.now || Date.now());
  const rows = asList(data.projects).map(project => buildProjectRow(project, data, now));
  return sortRows(rows.filter(row => matchesFilter(row, filters)), filters.sortBy);
}

export function getProjectFilterOptions(rows = []) {
  return {
    customers: uniq(rows.map(row => row.customerName)).map(name => {
      const row = rows.find(item => item.customerName === name);
      return { value: row.customerId || name, label: name };
    }),
    stages: uniq(rows.map(row => row.stage)),
    environments: uniq(rows.flatMap(row => row.environments)),
    owners: uniq(rows.map(row => row.owner)),
    healthStatuses: uniq(rows.map(row => row.healthStatus))
  };
}
