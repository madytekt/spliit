import { createTRPCRouter } from '@/trpc/init'
import { listGroupBalancesProcedure } from '@/trpc/routers/groups/balances/list.procedure'
import { listGroupsBalancesProcedure } from '@/trpc/routers/groups/balances/listForGroups.procedure'
import { netOutGroupsBalancesProcedure } from '@/trpc/routers/groups/balances/netOut.procedure'

export const groupBalancesRouter = createTRPCRouter({
  list: listGroupBalancesProcedure,
  listForGroups: listGroupsBalancesProcedure,
  netOut: netOutGroupsBalancesProcedure,
})
