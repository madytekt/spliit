import { prisma } from '@/lib/prisma'
import { baseProcedure } from '@/trpc/init'
import dayjs from 'dayjs'
import { z } from 'zod'

const granularitySchema = z.enum(['week', 'month', 'quarter', 'year'])
export type Granularity = z.infer<typeof granularitySchema>

/**
 * Returns the [start, end] day boundaries of the period identified by a
 * granularity and an integer offset from the current period (0 = current,
 * -1 = previous, …). Computed without extra dayjs plugins.
 */
function getPeriodRange(granularity: Granularity, offset: number) {
  const now = dayjs()
  switch (granularity) {
    case 'week': {
      const base = now.add(offset, 'week')
      return { start: base.startOf('week'), end: base.endOf('week') }
    }
    case 'month': {
      const base = now.add(offset, 'month')
      return { start: base.startOf('month'), end: base.endOf('month') }
    }
    case 'quarter': {
      const base = now.add(offset * 3, 'month')
      const qStartMonth = Math.floor(base.month() / 3) * 3
      const start = base.month(qStartMonth).startOf('month')
      return { start, end: start.add(2, 'month').endOf('month') }
    }
    case 'year': {
      const base = now.add(offset, 'year')
      return { start: base.startOf('year'), end: base.endOf('year') }
    }
  }
}

async function getPeriodTotal(
  groupId: string,
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
) {
  const rows = await prisma.expense.findMany({
    where: {
      groupId,
      isReimbursement: false,
      expenseDate: { gte: start.toDate(), lte: end.toDate() },
    },
    select: { amount: true },
  })
  return rows.reduce((sum, e) => sum + e.amount, 0)
}

export const getGroupStatsByCategoryProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      granularity: granularitySchema.default('month'),
      offset: z.number().int().default(0),
    }),
  )
  .query(async ({ input: { groupId, granularity, offset } }) => {
    const { start, end } = getPeriodRange(granularity, offset)
    const prev = getPeriodRange(granularity, offset - 1)

    const expenses = await prisma.expense.findMany({
      where: {
        groupId,
        isReimbursement: false,
        expenseDate: { gte: start.toDate(), lte: end.toDate() },
      },
      select: { amount: true, category: true },
    })

    // Group by category (null category rolls up under a synthetic key).
    const buckets = new Map<
      number,
      { category: { id: number; name: string; grouping: string } | null; amount: number }
    >()
    for (const e of expenses) {
      const key = e.category?.id ?? 0
      const existing = buckets.get(key)
      if (existing) existing.amount += e.amount
      else buckets.set(key, { category: e.category, amount: e.amount })
    }

    const categories = Array.from(buckets.values()).sort(
      (a, b) => b.amount - a.amount,
    )
    const total = categories.reduce((sum, c) => sum + c.amount, 0)
    const previousTotal = await getPeriodTotal(groupId, prev.start, prev.end)

    return {
      granularity,
      offset,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      total,
      previousTotal,
      categories,
    }
  })
