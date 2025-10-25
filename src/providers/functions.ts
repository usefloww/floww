import { Gitlab } from "./gitlab"
import { Slack } from "./slack"

const _usedProviders = new Set<string>()

export function getUsedProviders() {
  return Array.from(_usedProviders).map(s => {
    const [provider, alias] = s.split(":")
    return { provider, alias }
  })
}

export async function getProvider<T extends "gitlab" | "slack">(
  provider: T,
  alias: string = "default"
): Promise<T extends "gitlab" ? Gitlab : Slack> {
  _usedProviders.add(`${provider}:${alias}`)

  switch (provider) {
    case "gitlab":
      return new Gitlab() as any
    case "slack":
      return new Slack() as any
  }
  throw new Error("unknown provider")
}
