'use client'

import { Money } from '@/components/money'
import { useActiveUser } from '@/lib/hooks'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useCurrentGroup } from '../current-group-context'

export function GroupBalanceBanner() {
  const { groupId, group, isLoading: groupLoading } = useCurrentGroup()
  const activeUserId = useActiveUser(groupId)
  const { data } = trpc.groups.balances.list.useQuery(
    { groupId },
    {
      enabled: !!activeUserId && activeUserId !== 'None' && activeUserId !== '',
    },
  )

  if (
    groupLoading ||
    !group ||
    !activeUserId ||
    activeUserId === 'None' ||
    activeUserId === '' ||
    !data
  )
    return null

  const balance = data.balances[activeUserId]?.total ?? 0
  if (balance === 0) return null

  const currency = getCurrencyFromGroup(group)
  const isOwed = balance > 0

  return (
    <div
      className={`mb-4 rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 ${
        isOwed
          ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
          : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
      }`}
    >
      {isOwed ? (
        <>
          You are owed{' '}
          <Money currency={currency} amount={balance} bold colored /> in this
          group
        </>
      ) : (
        <>
          You owe{' '}
          <Money currency={currency} amount={Math.abs(balance)} bold colored />{' '}
          in this group
        </>
      )}
    </div>
  )
}
