import { getGroupExpenses } from '@/lib/api'
import { Balances, getBalances } from '@/lib/balances'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const listGroupsBalancesProcedure = baseProcedure
  .input(z.object({ groupIds: z.array(z.string().min(1)) }))
  .query(async ({ input: { groupIds } }) => {
    const results = await Promise.all(
      groupIds.map(async (groupId) => {
        const expenses = await getGroupExpenses(groupId)
        const balances = getBalances(expenses)
        return [groupId, balances] as const
      }),
    )
    return {
      balances: Object.fromEntries(results) as Record<string, Balances>,
    }
  })
