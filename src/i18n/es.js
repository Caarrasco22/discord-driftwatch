module.exports = {
  permissionDenied: 'Permiso denegado. Driftwatch requiere propietario del servidor, Administrador, Gestionar servidor o un rol autorizado de Driftwatch.',
  notInGuild: 'Los comandos de Driftwatch deben usarse en un servidor de Discord.',
  placeholder: 'Esta funcion esta preparada como base para v0.1.',
  reportLabels: {
    riskScore: 'Puntuación de riesgo',
    runType: 'Tipo de análisis',
    timestamp: 'Fecha',
    severitySummary: 'Resumen de severidad',
    topFindings: 'Hallazgos principales',
    topRecommendations: 'Recomendaciones principales',
    skippedChecks: 'Comprobaciones omitidas',
    v01Note: 'Nota v0.1'
  },
  reportNotes: {
    currentRisk: 'Los reportes de riesgo actual detectan configuración actual riesgosa usando heurísticas v0.1.',
    baselineCompare: 'Los reportes de comparación de baseline detectan cambios contra una baseline guardada usando heurísticas v0.1.',
    heuristic: 'Este reporte usa comprobaciones heurísticas y datos de configuración de Discord en caché. Ayuda a priorizar revisión, pero no garantiza cobertura completa de seguridad.',
    noFindings: 'No se registraron hallazgos para este análisis.',
    noRecommendations: 'No se registraron recomendaciones para este análisis.',
    noSkippedChecks: 'Ninguna registrada.'
  }
};
