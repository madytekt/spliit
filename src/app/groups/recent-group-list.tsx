'use client'
import { AddGroupByUrlButton } from '@/app/groups/add-group-by-url-button'
import {
  RecentGroups,
  getArchivedGroups,
  getRecentGroups,
  getStarredGroups,
} from '@/app/groups/recent-groups-helpers'
import { Button } from '@/components/ui/button'
import { getGroups } from '@/lib/api'
import { findNetOutTarget } from '@/lib/net-out'
import { formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { PropsWithChildren, useEffect, useState } from 'react'
import { NetOutButton } from './net-out-button'
import { RecentGroupListCard } from './recent-group-list-card'

export type RecentGroupsState =
  | { status: 'pending' }
  | {
      status: 'partial'
      groups: RecentGroups
      starredGroups: string[]
      archivedGroups: string[]
    }
  | {
      status: 'complete'
      groups: RecentGroups
      groupsDetails: Awaited<ReturnType<typeof getGroups>>
      starredGroups: string[]
      archivedGroups: string[]
    }

function sortGroups({
  groups,
  starredGroups,
  archivedGroups,
}: {
  groups: RecentGroups
  starredGroups: string[]
  archivedGroups: string[]
}) {
  const starredGroupInfo = []
  const groupInfo = []
  const archivedGroupInfo = []
  for (const group of groups) {
    if (starredGroups.includes(group.id)) {
      starredGroupInfo.push(group)
    } else if (archivedGroups.includes(group.id)) {
      archivedGroupInfo.push(group)
    } else {
      groupInfo.push(group)
    }
  }
  return {
    starredGroupInfo,
    groupInfo,
    archivedGroupInfo,
  }
}

export function RecentGroupList() {
  const [state, setState] = useState<RecentGroupsState>({ status: 'pending' })

  function loadGroups() {
    const groupsInStorage = getRecentGroups()
    const starredGroups = getStarredGroups()
    const archivedGroups = getArchivedGroups()
    setState({
      status: 'partial',
      groups: groupsInStorage,
      starredGroups,
      archivedGroups,
    })
  }

  useEffect(() => {
    loadGroups()
  }, [])

  if (state.status === 'pending') return null

  return (
    <RecentGroupList_
      groups={state.groups}
      starredGroups={state.starredGroups}
      archivedGroups={state.archivedGroups}
      refreshGroupsFromStorage={() => loadGroups()}
    />
  )
}

function RecentGroupList_({
  groups,
  starredGroups,
  archivedGroups,
  refreshGroupsFromStorage,
}: {
  groups: RecentGroups
  starredGroups: string[]
  archivedGroups: string[]
  refreshGroupsFromStorage: () => void
}) {
  const t = useTranslations('Groups')
  const locale = useLocale()
  const [activeUsers, setActiveUsers] = useState<Record<string, string>>({})

  useEffect(() => {
    const mapping: Record<string, string> = {}
    for (const group of groups) {
      const u = localStorage.getItem(`${group.id}-activeUser`)
      if (u && u !== 'None' && u !== '') mapping[group.id] = u
    }
    setActiveUsers(mapping)
  }, [groups])

  const { data, isLoading } = trpc.groups.list.useQuery({
    groupIds: groups.map((group) => group.id),
  })

  const { data: balancesData } = trpc.groups.balances.listForGroups.useQuery(
    { groupIds: groups.map((group) => group.id) },
    { enabled: groups.length > 0 },
  )

  if (isLoading || !data) {
    return (
      <GroupsPage reload={refreshGroupsFromStorage}>
        <p>
          <Loader2 className="w-4 m-4 mr-2 inline animate-spin" />{' '}
          {t('loadingRecent')}
        </p>
      </GroupsPage>
    )
  }

  if (data.groups.length === 0) {
    return (
      <GroupsPage reload={refreshGroupsFromStorage}>
        <div className="text-sm space-y-2">
          <p>{t('NoRecent.description')}</p>
          <p>
            <Button variant="link" asChild className="-m-4">
              <Link href={`/groups/create`}>{t('NoRecent.create')}</Link>
            </Button>{' '}
            {t('NoRecent.orAsk')}
          </p>
        </div>
      </GroupsPage>
    )
  }

  const { starredGroupInfo, groupInfo, archivedGroupInfo } = sortGroups({
    groups,
    starredGroups,
    archivedGroups,
  })

  // Compute per-group balances and cross-group total for the active user
  const userBalances: Record<string, number | undefined> = {}
  let crossGroupTotal = 0
  let crossGroupCurrency: ReturnType<typeof getCurrencyFromGroup> | null = null
  let allSameCurrency = true

  for (const group of groups) {
    const activeUserId = activeUsers[group.id]
    const groupDetail = data.groups.find((g) => g.id === group.id)
    if (!activeUserId || !groupDetail || !balancesData) continue

    const bal = balancesData.balances[group.id]?.[activeUserId]?.total
    userBalances[group.id] = bal ?? 0

    const currency = getCurrencyFromGroup(groupDetail)
    if (crossGroupCurrency === null) {
      crossGroupCurrency = currency
    } else if (currency.code !== crossGroupCurrency.code) {
      allSameCurrency = false
    }
    crossGroupTotal += bal ?? 0
  }

  // Net out: fold every other group's balance into the "Everyday" group
  const netOutTargetDetail = findNetOutTarget(
    data.groups.filter((g) => userBalances[g.id] !== undefined),
  )
  const netOutSources = data.groups
    .filter((g) => g.id !== netOutTargetDetail?.id && userBalances[g.id])
    .map((g) => ({ id: g.id, name: g.name, balance: userBalances[g.id]! }))

  const showCrossGroupTotal =
    allSameCurrency &&
    crossGroupCurrency !== null &&
    Object.keys(userBalances).length > 0

  return (
    <GroupsPage reload={refreshGroupsFromStorage}>
      {showCrossGroupTotal && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm flex items-center justify-between ${
            crossGroupTotal > 0
              ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
              : crossGroupTotal < 0
              ? 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <span className="font-medium">
            {crossGroupTotal === 0
              ? 'All settled up across groups'
              : crossGroupTotal > 0
              ? 'You are owed overall'
              : 'You owe overall'}
          </span>
          <span className="flex items-center gap-3">
            {crossGroupTotal !== 0 && (
              <span className="font-bold text-base">
                {formatCurrency(
                  crossGroupCurrency!,
                  Math.abs(crossGroupTotal),
                  locale,
                )}
              </span>
            )}
            {netOutTargetDetail && netOutSources.length > 0 && (
              <NetOutButton
                target={{
                  id: netOutTargetDetail.id,
                  name: netOutTargetDetail.name,
                  balance: userBalances[netOutTargetDetail.id] ?? 0,
                }}
                sources={netOutSources}
                currency={crossGroupCurrency!}
              />
            )}
          </span>
        </div>
      )}

      {starredGroupInfo.length > 0 && (
        <>
          <h2 className="mb-2">{t('starred')}</h2>
          <GroupList
            groups={starredGroupInfo}
            groupDetails={data.groups}
            archivedGroups={archivedGroups}
            starredGroups={starredGroups}
            refreshGroupsFromStorage={refreshGroupsFromStorage}
            userBalances={userBalances}
          />
        </>
      )}

      {groupInfo.length > 0 && (
        <>
          <h2 className="mt-6 mb-2">{t('recent')}</h2>
          <GroupList
            groups={groupInfo}
            groupDetails={data.groups}
            archivedGroups={archivedGroups}
            starredGroups={starredGroups}
            refreshGroupsFromStorage={refreshGroupsFromStorage}
            userBalances={userBalances}
          />
        </>
      )}

      {archivedGroupInfo.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 opacity-50">{t('archived')}</h2>
          <div className="opacity-50">
            <GroupList
              groups={archivedGroupInfo}
              groupDetails={data.groups}
              archivedGroups={archivedGroups}
              starredGroups={starredGroups}
              refreshGroupsFromStorage={refreshGroupsFromStorage}
              userBalances={userBalances}
            />
          </div>
        </>
      )}
    </GroupsPage>
  )
}

function GroupList({
  groups,
  groupDetails,
  starredGroups,
  archivedGroups,
  refreshGroupsFromStorage,
  userBalances,
}: {
  groups: RecentGroups
  groupDetails?: AppRouterOutput['groups']['list']['groups']
  starredGroups: string[]
  archivedGroups: string[]
  refreshGroupsFromStorage: () => void
  userBalances?: Record<string, number | undefined>
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {groups.map((group) => (
        <RecentGroupListCard
          key={group.id}
          group={group}
          groupDetail={groupDetails?.find(
            (groupDetail) => groupDetail.id === group.id,
          )}
          isStarred={starredGroups.includes(group.id)}
          isArchived={archivedGroups.includes(group.id)}
          refreshGroupsFromStorage={refreshGroupsFromStorage}
          userBalanceTotal={userBalances?.[group.id]}
        />
      ))}
    </ul>
  )
}

function GroupsPage({
  children,
  reload,
}: PropsWithChildren<{ reload: () => void }>) {
  const t = useTranslations('Groups')
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="font-bold text-2xl flex-1">
          <Link href="/groups">{t('myGroups')}</Link>
        </h1>
        <div className="flex gap-2">
          <AddGroupByUrlButton reload={reload} />
          <Button asChild>
            <Link href="/groups/create">
              {/* <Plus className="w-4 h-4 mr-2" /> */}
              {t('create')}
            </Link>
          </Button>
        </div>
      </div>
      <div>{children}</div>
    </>
  )
}
