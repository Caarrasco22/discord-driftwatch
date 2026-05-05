module.exports = {
  permissionDenied: 'Permiso denegado. Driftwatch requiere propietario del servidor, Administrador, Gestionar servidor o un rol autorizado de Driftwatch.',
  notInGuild: 'Los comandos de Driftwatch deben usarse en un servidor de Discord.',
  placeholder: 'Esta funcion esta preparada como base para v0.1.',
  reportLabels: {
    riskScore: 'Puntuacion de riesgo',
    runType: 'Tipo de analisis',
    timestamp: 'Fecha',
    severitySummary: 'Resumen de severidad',
    topFindings: 'Hallazgos principales',
    topRecommendations: 'Recomendaciones principales',
    skippedChecks: 'Comprobaciones omitidas',
    v01Note: 'Nota v0.1'
  },
  reportNotes: {
    currentRisk: 'Los reportes de riesgo actual detectan configuracion actual riesgosa usando heuristicas v0.1.',
    baselineCompare: 'Los reportes de comparacion de baseline detectan cambios contra una referencia guardada usando heuristicas v0.1. Un baseline no certifica seguridad.',
    logs: 'Este reporte resume senales derivadas del audit log. No contiene logs crudos ni mensajes.',
    heuristic: 'Este reporte usa comprobaciones heuristicas y datos de configuracion de Discord en cache. Ayuda a priorizar revision, pero no garantiza cobertura completa de seguridad.',
    noFindings: 'No se registraron hallazgos para este analisis.',
    noRecommendations: 'No se registraron recomendaciones para este analisis.',
    noSkippedChecks: 'Ninguna registrada.'
  }
};
