'use client'
import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import { useCurrentGroup } from '@/app/groups/[groupId]/current-group-context'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Granularity } from '@/trpc/routers/groups/stats/by-category.procedure'
import { cn, formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import dayjs from 'dayjs'
import { useLocale } from 'next-intl'
import { useState } from 'react'

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
]

const PREVIOUS_NOUN: Record<Granularity, string> = {
  week: 'last week',
  month: 'last month',
  quarter: 'last quarter',
  year: 'last year',
}

function periodLabels(
  granularity: Granularity,
  offset: number,
  startISO: string,
  endISO: string,
) {
  const start = dayjs(startISO)
  const end = dayjs(endISO)
  const range = `${start.format('MMM D')} – ${end.format('MMM D')}`

  switch (granularity) {
    case 'week': {
      const name =
        offset === 0
          ? 'This week'
          : offset === -1
          ? 'Last week'
          : `${Math.abs(offset)} weeks ago`
      return { name, range }
    }
    case 'month':
      return { name: start.format('MMMM YYYY'), range }
    case 'quarter':
      return {
        name: `Q${Math.floor(start.month() / 3) + 1} ${start.format('YYYY')}`,
        range,
      }
    case 'year':
      return { name: start.format('YYYY'), range }
  }
}

export function SpendingByCategory() {
  const { groupId, group } = useCurrentGroup()
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [offset, setOffset] = useState(0)
  const locale = useLocale()

  const { data } = trpc.groups.stats.byCategory.useQuery({
    groupId,
    granularity,
    offset,
  })

  const setG = (g: Granularity) => {
    setGranularity(g)
    setOffset(0)
  }

  const currency = group ? getCurrencyFromGroup(group) : null

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Spending by category</CardTitle>
        <CardDescription>
          Where the group&apos;s money went this period.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* granularity segmented control */}
        <div className="flex bg-background border rounded-lg p-1 mb-4">
          {GRANULARITIES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setG(value)}
              className={cn(
                'flex-1 py-2 rounded-md text-sm font-medium transition-colors',
                granularity === value
                  ? 'bg-primary text-primary-foreground font-bold'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* period navigator */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="w-9 h-9 flex items-center justify-center rounded-md border bg-background hover:bg-accent"
            aria-label="Previous period"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            {data ? (
              (() => {
                const { name, range } = periodLabels(
                  granularity,
                  offset,
                  data.startDate,
                  data.endDate,
                )
                return (
                  <>
                    <div className="font-bold">{name}</div>
                    <div className="text-xs text-muted-foreground">{range}</div>
                  </>
                )
              })()
            ) : (
              <Skeleton className="h-5 w-32" />
            )}
          </div>
          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset >= 0}
            className="w-9 h-9 flex items-center justify-center rounded-md border bg-background hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next period"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* period total + delta vs previous period */}
        {data && currency && (
          <div className="flex items-baseline gap-3 mt-4 mb-5 pt-4 border-t">
            <div className="text-2xl font-bold">
              {formatCurrency(currency, data.total, locale)}
            </div>
            {data.previousTotal > 0 &&
              (() => {
                const pct = Math.round(
                  ((data.total - data.previousTotal) / data.previousTotal) *
                    100,
                )
                if (pct === 0) return null
                const up = pct > 0
                return (
                  <span
                    className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded-full',
                      up
                        ? 'text-red-400 bg-red-400/10'
                        : 'text-emerald-400 bg-emerald-400/10',
                    )}
                  >
                    {up ? '▲' : '▼'} {Math.abs(pct)}% vs{' '}
                    {PREVIOUS_NOUN[granularity]}
                  </span>
                )
              })()}
          </div>
        )}

        {/* bars */}
        {!data || !currency ? (
          <div className="flex flex-col gap-4 mt-4">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <Skeleton className="h-4 w-40 mb-2" />
                <Skeleton className="h-2.5 w-full" />
              </div>
            ))}
          </div>
        ) : data.categories.length === 0 ? (
          <div className="text-muted-foreground text-center py-9 text-sm">
            No expenses in this period.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {data.categories.map((c, i) => {
              const max = data.categories[0].amount || 1
              const width = (c.amount / max) * 100
              const pct = data.total
                ? ((c.amount / data.total) * 100).toFixed(1)
                : '0.0'
              return (
                <div key={c.category?.id ?? `uncat-${i}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CategoryIcon
                        category={c.category}
                        className="w-4 h-4 text-muted-foreground"
                      />
                      {c.category?.name ?? 'Uncategorized'}
                    </div>
                    <div className="text-right tabular-nums">
                      <span className="text-sm font-semibold">
                        {formatCurrency(currency, c.amount, locale)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {pct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-background rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-primary transition-[width] duration-300"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              )
            })}
            <div className="text-[11px] text-muted-foreground flex gap-3.5 flex-wrap mt-1">
              <span>Bar length = size relative to the biggest category</span>
              <span>% = share of period total</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
