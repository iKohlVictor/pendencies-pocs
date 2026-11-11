/** Thrown by defineMachine when the definition is inconsistent (a programming error). */
export class MachineDefinitionError extends Error {
  constructor(
    public readonly machineId: string,
    public readonly problems: readonly string[],
  ) {
    super(`Invalid machine "${machineId}":\n- ${problems.join('\n- ')}`);
    this.name = 'MachineDefinitionError';
  }
}
