function permissionLabels(permissions) {
  if (!permissions || !permissions.toArray) return [];
  return permissions.toArray();
}

module.exports = { permissionLabels };
