/**
 * Policy Violation Error
 *
 * Thrown when a provider action is denied by policy rules.
 */
export class PolicyViolationError extends Error {
  public readonly providerType: string;
  public readonly action: string;

  constructor(message: string, providerType: string, action: string) {
    super(message);
    this.name = 'PolicyViolationError';
    this.providerType = providerType;
    this.action = action;
  }
}
