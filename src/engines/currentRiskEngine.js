const { createFinding } = require('../models/finding');
const { Severity } = require('../models/severity');
const { Categories } = require('../models/categories');

function evaluateCurrentRisk(guild) {
  return [
    createFinding({
      severity: Severity.INFO,
      category: Categories.COMPLIANCE,
      title: 'Current risk engine scaffolded',
      assetType: 'guild',
      assetId: guild.id,
      assetName: guild.name,
      evidence: ['v0.1 placeholder: no risky configuration claim is made.'],
      recommendation: 'Create a baseline and review future Driftwatch releases for expanded defensive checks.',
      confidence: 0.4
    })
  ];
}

module.exports = { evaluateCurrentRisk };
