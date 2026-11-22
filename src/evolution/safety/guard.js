const allowedCapabilities = new Set([
  'conversation.respond',
  'memory.read',
  'memory.write'
]);

const forbiddenCapabilities = new Set([
  'system.modify',
  'shell.execute',
  'project.modify',
  'security.modify',
  'permission.modify'
]);

export function checkCapability(capability) {
  if (forbiddenCapabilities.has(capability)) {
    return false;
  }

  return allowedCapabilities.has(capability);
}

export function requireCapability(capability) {
  if (!checkCapability(capability)) {
    throw new Error(`Capability denied: ${capability}`);
  }

  return true;
}
