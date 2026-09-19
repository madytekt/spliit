import { Balances, getSuggestedReimbursements } from '@/lib/balances'

/**
 * Cross-group "net out": move every other group's outstanding balance into a
 * single target group (e.g. "Everyday") by recording a pair of offsetting
 * reimbursements per debt:
 *
 *   - in the source group, `from` pays `to` → the source group settles to 0
 *   - in the target group, `to` pays `from` → the same debt reappears there
 *
 * The two entries cancel out, so each person's overall balance across groups
 * is unchanged. No real money moves. Participants are per-group in the schema,
 * so people are matched across groups by (case-insensitive, trimmed) name.
 */

export type NetOutGroup = {
  id: string
  name: string
  currencyCode: string | null
  currency: string
  participants: { id: string; name: string }[]
  balances: Balances
}

export type NetOutTransfer = {
  sourceGroupId: string
  sourceGroupName: string
  amount: number
  source: { paidById: string; paidForId: string }
  target: { paidById: string; paidForId: string }
}

export type NetOutSkip = {
  groupId: string
  groupName: string
  reason: 'currency-mismatch' | 'participant-not-found'
}

export type NetOutPlan = {
  transfers: NetOutTransfer[]
  skipped: NetOutSkip[]
}

const normalizeName = (name: string) => name.trim().toLowerCase()

function sameCurrency(a: NetOutGroup, b: NetOutGroup) {
  return (a.currencyCode ?? a.currency) === (b.currencyCode ?? b.currency)
}

export function planNetOut(
  target: NetOutGroup,
  sources: NetOutGroup[],
): NetOutPlan {
  const transfers: NetOutTransfer[] = []
  const skipped: NetOutSkip[] = []

  const targetIdByName = new Map(
    target.participants.map((p) => [normalizeName(p.name), p.id]),
  )

  for (const source of sources) {
    if (source.id === target.id) continue

    const reimbursements = getSuggestedReimbursements(source.balances)
    if (reimbursements.length === 0) continue

    if (!sameCurrency(source, target)) {
      skipped.push({
        groupId: source.id,
        groupName: source.name,
        reason: 'currency-mismatch',
      })
      continue
    }

    const nameById = new Map(source.participants.map((p) => [p.id, p.name]))
    const toTargetId = (sourceId: string) => {
      const name = nameById.get(sourceId)
      return name === undefined
        ? undefined
        : targetIdByName.get(normalizeName(name))
    }

    const groupTransfers: NetOutTransfer[] = []
    let unmapped = false
    for (const { from, to, amount } of reimbursements) {
      const targetFrom = toTargetId(from)
      const targetTo = toTargetId(to)
      if (!targetFrom || !targetTo) {
        unmapped = true
        break
      }
      groupTransfers.push({
        sourceGroupId: source.id,
        sourceGroupName: source.name,
        amount: Math.round(amount),
        source: { paidById: from, paidForId: to },
        target: { paidById: targetTo, paidForId: targetFrom },
      })
    }

    // All-or-nothing per group: never leave a group half netted out.
    if (unmapped) {
      skipped.push({
        groupId: source.id,
        groupName: source.name,
        reason: 'participant-not-found',
      })
      continue
    }
    transfers.push(...groupTransfers)
  }

  return { transfers, skipped }
}

/** The group netted balances are moved into: the one named "Everyday". */
export function findNetOutTarget<T extends { name: string }>(
  groups: T[],
): T | undefined {
  return groups.find((g) => normalizeName(g.name) === 'everyday')
}
