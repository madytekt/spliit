import { Balances, getPublicBalances } from '@/lib/balances'
import { NetOutGroup, findNetOutTarget, planNetOut } from '@/lib/net-out'

function group(
  id: string,
  name: string,
  totals: Record<string, number>,
  currencyCode = 'USD',
): NetOutGroup {
  const balances: Balances = {}
  for (const [person, total] of Object.entries(totals)) {
    balances[`${id}-${person}`] = { paid: 0, paidFor: 0, total }
  }
  return {
    id,
    name,
    currency: '$',
    currencyCode,
    participants: Object.keys(totals).map((person) => ({
      id: `${id}-${person}`,
      name: person,
    })),
    balances,
  }
}

// Apply a plan to the per-group balances and return the new totals by group.
function apply(groups: NetOutGroup[], target: NetOutGroup) {
  const plan = planNetOut(target, groups)
  const totals: Record<string, Record<string, number>> = {}
  for (const g of groups) {
    totals[g.id] = Object.fromEntries(
      Object.entries(g.balances).map(([id, b]) => [id, b.total]),
    )
  }
  for (const t of plan.transfers) {
    // A reimbursement "paidBy pays paidFor" moves +amount to paidBy.
    const src = getPublicBalances([
      { from: t.source.paidForId, to: t.source.paidById, amount: t.amount },
    ])
    const tgt = getPublicBalances([
      { from: t.target.paidForId, to: t.target.paidById, amount: t.amount },
    ])
    for (const [id, b] of Object.entries(src))
      totals[t.sourceGroupId][id] = (totals[t.sourceGroupId][id] ?? 0) + b.total
    for (const [id, b] of Object.entries(tgt))
      totals[target.id][id] = (totals[target.id][id] ?? 0) + b.total
  }
  return { plan, totals }
}

describe('planNetOut', () => {
  const everyday = group('e', 'Everyday', { May: -12000, Sam: 12000 })
  const wedding = group('w', 'Wedding', { May: 500000, Sam: -500000 })
  const travels = group('t', 'Travels', { May: -3000, Sam: 3000 })

  it('settles every source group and moves the balance into the target', () => {
    const { plan, totals } = apply([everyday, wedding, travels], everyday)
    expect(plan.skipped).toEqual([])
    expect(plan.transfers).toHaveLength(2)
    expect(totals.w).toEqual({ 'w-May': 0, 'w-Sam': 0 })
    expect(totals.t).toEqual({ 't-May': 0, 't-Sam': 0 })
    // 5000.00 - 120.00 - 30.00 = 4850.00 owed to May, now all in Everyday
    expect(totals.e).toEqual({ 'e-May': 485000, 'e-Sam': -485000 })
  })

  it('records the source leg as debtor paying creditor', () => {
    const { transfers } = planNetOut(everyday, [wedding])
    expect(transfers).toEqual([
      {
        sourceGroupId: 'w',
        sourceGroupName: 'Wedding',
        amount: 500000,
        source: { paidById: 'w-Sam', paidForId: 'w-May' },
        target: { paidById: 'e-May', paidForId: 'e-Sam' },
      },
    ])
  })

  it('ignores settled groups and the target itself', () => {
    const settled = group('s', 'Settled', { May: 0, Sam: 0 })
    expect(planNetOut(everyday, [everyday, settled]).transfers).toEqual([])
  })

  it('matches people by name case- and whitespace-insensitively', () => {
    const g = group('x', 'X', { ' may ': 100, SAM: -100 })
    const { plan, totals } = apply([everyday, g], everyday)
    expect(plan.skipped).toEqual([])
    expect(totals.e).toEqual({ 'e-May': -11900, 'e-Sam': 11900 })
  })

  it('skips groups in another currency', () => {
    const eur = group('eu', 'Europe', { May: 100, Sam: -100 }, 'EUR')
    expect(planNetOut(everyday, [eur])).toEqual({
      transfers: [],
      skipped: [
        { groupId: 'eu', groupName: 'Europe', reason: 'currency-mismatch' },
      ],
    })
  })

  it('skips a whole group if anyone in it is missing from the target', () => {
    const trip = group('tr', 'Trip', { May: 200, Sam: -100, Alex: -100 })
    expect(planNetOut(everyday, [trip])).toEqual({
      transfers: [],
      skipped: [
        { groupId: 'tr', groupName: 'Trip', reason: 'participant-not-found' },
      ],
    })
  })

  it('handles groups with more than two people', () => {
    const target = group('e3', 'Everyday', { May: 0, Sam: 0, Alex: 0 })
    const trip = group('tr', 'Trip', { May: 200, Sam: -150, Alex: -50 })
    const { totals } = apply([target, trip], target)
    expect(totals.tr).toEqual({ 'tr-May': 0, 'tr-Sam': 0, 'tr-Alex': 0 })
    expect(totals.e3).toEqual({ 'e3-May': 200, 'e3-Sam': -150, 'e3-Alex': -50 })
  })
})

describe('findNetOutTarget', () => {
  it('finds the Everyday group by name', () => {
    expect(
      findNetOutTarget([{ name: 'Wedding' }, { name: ' everyday ' }]),
    ).toEqual({ name: ' everyday ' })
    expect(findNetOutTarget([{ name: 'Wedding' }])).toBeUndefined()
  })
})
