import type { AccountId } from '../shared/contracts'

const summaries = new Map<AccountId, unknown>()

export function setMobileHuntSummary(accountId: AccountId, summary: unknown): void {
  if (summary === null || summary === undefined) summaries.delete(accountId)
  else summaries.set(accountId, summary)
}

export function getMobileHuntSummary(accountId: AccountId): unknown {
  return summaries.get(accountId) ?? null
}
