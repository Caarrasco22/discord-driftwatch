const { createId } = require('../utils/ids');
const { nowIso } = require('../utils/time');
const { Severity } = require('./severity');
const { Categories } = require('./categories');

function createFinding(input = {}) {
  return {
    id: input.id || input.findingId || createId('finding'),
    ruleId: input.ruleId || 'placeholder',
    severity: input.severity || Severity.INFO,
    category: input.category || Categories.COMPLIANCE,
    title: input.title || 'Informational finding',
    assetType: input.assetType || 'guild',
    assetId: input.assetId || null,
    assetName: input.assetName || null,
    previousValue: input.previousValue || null,
    currentValue: input.currentValue || null,
    actorId: input.actorId || null,
    actorName: input.actorName || null,
    impact: input.impact || 'No direct impact identified in this placeholder finding.',
    likelihood: input.likelihood || 'unknown',
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    recommendation: input.recommendation || 'Review this item with an authorized server administrator.',
    confidence: typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : 0.5,
    remediationDifficulty: input.remediationDifficulty || null,
    safeToAutoFix: false,
    createdAt: input.createdAt || nowIso()
  };
}

module.exports = { createFinding };
