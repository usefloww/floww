import type { MessagePart, SecretSetupData } from '../context';

export function extractSecrets(code: string): string[] {
  const patterns = [
    /new\s+Secret\s*\(\s*['"]([^'"]+)['"]/g,
    /Secret<['"]([^'"]+)['"]>/g,
  ];

  const secrets: string[] = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      if (!secrets.includes(match[1])) {
        secrets.push(match[1]);
      }
    }
  }

  return secrets;
}

export function cleanCode(code: string): string {
  let cleaned = code.replace(/^```(?:typescript|ts)?\n?/gm, '');
  cleaned = cleaned.replace(/\n?```$/gm, '');
  return cleaned.trim();
}

export function inferSecretType(secretName: string): string {
  const name = secretName.toLowerCase();

  if (name.includes('api_key') || name.includes('apikey')) {
    return 'api_key';
  }
  if (name.includes('token')) {
    return 'token';
  }
  if (name.includes('secret')) {
    return 'secret';
  }
  if (name.includes('password')) {
    return 'password';
  }
  if (name.includes('webhook')) {
    return 'webhook_url';
  }

  return 'credential';
}

export function buildSecretParts(secrets: string[]): MessagePart[] {
  return secrets.map((secretName) => {
    const secretData: SecretSetupData = {
      secretName,
      secretType: inferSecretType(secretName),
      description: `API key or credential for ${secretName}`,
      configured: false,
    };
    return {
      type: 'data-secret-setup' as const,
      data: secretData,
    };
  });
}
