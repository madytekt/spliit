import { createTRPCRouter } from '@/trpc/init'
import { listGroupBalancesProcedure } from '@/trpc/routers/groups/balances/list.procedure'
import { listGroupsBalancesProcedure } from '@/trpc/routers/groups/balances/listForGroups.procedure'

export const groupBalancesRouter = createTRPCRouter({
  list: listGroupBalancesProcedure,
  listForGroups: listGroupsBalancesProcedure,
})
