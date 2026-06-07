import type { Role, Level, SystemConfig } from './types.js';

export class RoleRegistry {
  private roles: Map<string, Role> = new Map();
  private levelIndex: Map<Level, Role[]> = new Map([
    ['L1', []],
    ['L2', []],
    ['L3', []],
  ]);

  constructor(config?: SystemConfig) {
    if (config) {
      this.loadFromConfig(config);
    }
  }

  loadFromConfig(config: SystemConfig): void {
    for (const role of config.roles) {
      this.register(role);
    }
  }

  register(role: Role): void {
    this.roles.set(role.id, role);
    const levelRoles = this.levelIndex.get(role.level) || [];
    levelRoles.push(role);
    this.levelIndex.set(role.level, levelRoles);
  }

  get(roleId: string): Role | undefined {
    return this.roles.get(roleId);
  }

  getByLevel(level: Level): Role[] {
    return this.levelIndex.get(level) || [];
  }

  getAll(): Role[] {
    return Array.from(this.roles.values());
  }

  /**
   * Get the escalation path for a role (ordered list of roles to escalate to)
   */
  getEscalationPath(roleId: string): Role[] {
    const role = this.roles.get(roleId);
    if (!role) return [];

    return role.escalationPath
      .map(id => this.roles.get(id))
      .filter((r): r is Role => r !== undefined);
  }

  /**
   * Get the next escalation target for a role
   */
  getNextEscalation(roleId: string): Role | undefined {
    const path = this.getEscalationPath(roleId);
    return path[0];
  }

  /**
   * Check if roleA can communicate with roleB
   */
  canCommunicate(fromRoleId: string, toRoleId: string): boolean {
    const fromRole = this.roles.get(fromRoleId);
    if (!fromRole) return false;

    return fromRole.canCommunicateWith.includes('*') || fromRole.canCommunicateWith.includes(toRoleId);
  }

  /**
   * Get roles that a given role can communicate with
   */
  getCommunicationTargets(roleId: string): Role[] {
    const role = this.roles.get(roleId);
    if (!role) return [];

    if (role.canCommunicateWith.includes('*')) {
      return Array.from(this.roles.values()).filter(r => r.id !== roleId);
    }

    return role.canCommunicateWith
      .map(id => this.roles.get(id))
      .filter((r): r is Role => r !== undefined);
  }

  /**
   * Find the best role to handle a given capability
   */
  findByCapability(capability: string): Role[] {
    return Array.from(this.roles.values()).filter(r => r.capabilities.includes(capability));
  }

  /**
   * Get hierarchy summary for display
   */
  getHierarchy(): Record<Level, { id: string; name: string; model: string }[]> {
    return {
      L1: this.getByLevel('L1').map(r => ({ id: r.id, name: r.name, model: r.model })),
      L2: this.getByLevel('L2').map(r => ({ id: r.id, name: r.name, model: r.model })),
      L3: this.getByLevel('L3').map(r => ({ id: r.id, name: r.name, model: r.model })),
    };
  }
}
