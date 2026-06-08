#!/usr/bin/env node
'use strict'

/**
 * Syncs all Spliit expense data to a Google Sheet.
 *
 * Prerequisites:
 *   1. Set GOOGLE_SHEET_ID in container.env
 *   2. Place google-credentials.json in spliit/ (gitignored, mounted into container)
 *   3. Share the Google Sheet with the service account's client_email (Editor access)
 *
 * Run manually:
 *   docker exec spliit-app-1 node scripts/sync-sheets.js
 *
 * Schedule nightly (add to VPS crontab via `crontab -e`):
 *   0 21 * * * docker exec spliit-app-1 node scripts/sync-sheets.js >> /home/ubuntu/spliit-sync.log 2>&1
 */

const { Client } = require('pg')
const { google } = require('googleapis')

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID
const CREDENTIALS_PATH =
  process.env.GOOGLE_CREDENTIALS_FILE || '/usr/app/google-credentials.json'
const DB_URL = process.env.POSTGRES_URL_NON_POOLING

const SYNC_LOG_TAB = 'Sync Log'

const SPLIT_MODE_LABELS = {
  EVENLY: 'Evenly',
  BY_SHARES: 'Unevenly – By shares',
  BY_PERCENTAGE: 'Unevenly – By percentage',
  BY_AMOUNT: 'Unevenly – By amount',
}

// Load currency decimal_digits for correct amount formatting (e.g. JPY has 0)
let currencyData = {}
try {
  currencyData = require('/usr/app/src/lib/currency-data.json')
} catch (_) {}

function getDecimalDigits(currencyCode) {
  return currencyData[currencyCode]?.decimal_digits ?? 2
}

function formatAmount(minorUnits, currencyCode) {
  if (minorUnits == null) return ''
  const digits = getDecimalDigits(currencyCode)
  return (minorUnits / Math.pow(10, digits)).toFixed(digits)
}

function formatDate(date) {
  const d = new Date(date)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function utcTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

async function ensureTab(sheets, spreadsheetId, title, allSheets) {
  if (allSheets.some((s) => s.title === title)) return
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  })
}

async function writeTab(sheets, spreadsheetId, tabName, rows) {
  const range = `'${tabName}'!A:ZZZ`
  await sheets.spreadsheets.values.clear({ spreadsheetId, range })
  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    })
  }
}

// Appends one row to the Sync Log tab. Creates the tab + header if missing.
async function appendSyncLog(sheets, spreadsheetId, knownSheets, status, groupCount, totalExpenses, errorMsg) {
  await ensureTab(sheets, spreadsheetId, SYNC_LOG_TAB, knownSheets)

  // Write header if tab is empty
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SYNC_LOG_TAB}'!A1`,
  })
  if (!data.values || data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${SYNC_LOG_TAB}'!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Timestamp (UTC)', 'Status', 'Groups', 'Expenses', 'Error']],
      },
    })
  }

  const row = [
    utcTimestamp(),
    status === 'success' ? '✅ Success' : '❌ Failed',
    status === 'success' ? groupCount : '',
    status === 'success' ? totalExpenses : '',
    errorMsg || '',
  ]

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${SYNC_LOG_TAB}'!A:E`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  })
}

// Module-level handles so the catch block can write to the log even on mid-run failure
let _sheets = null
let _knownSheets = []

async function main() {
  if (!SPREADSHEET_ID)
    throw new Error('GOOGLE_SHEET_ID is not set in the environment')
  if (!DB_URL)
    throw new Error('POSTGRES_URL_NON_POOLING is not set in the environment')

  // ── Fetch data from Postgres ──────────────────────────────────────────────

  const db = new Client({ connectionString: DB_URL })
  await db.connect()

  const { rows: groups } = await db.query(
    `SELECT id, name, currency, "currencyCode" FROM "Group" ORDER BY name`,
  )

  const { rows: participants } = await db.query(
    `SELECT id, name, "groupId" FROM "Participant" ORDER BY "groupId", name`,
  )

  // Aggregate paidFor per expense in one query
  const { rows: expenses } = await db.query(`
    SELECT
      e.id,
      e."groupId",
      e."paidById",
      e."expenseDate",
      e.title,
      cat.name            AS category_name,
      e.amount,
      e."originalAmount",
      e."originalCurrency",
      e."conversionRate",
      e."isReimbursement",
      e."splitMode",
      e.notes,
      e."createdAt",
      p_paid.name         AS paid_by_name,
      COALESCE(
        json_agg(
          json_build_object('participantId', pf."participantId", 'shares', pf.shares)
        ) FILTER (WHERE pf."participantId" IS NOT NULL),
        '[]'::json
      ) AS paid_for
    FROM "Expense" e
    LEFT JOIN "Category"       cat    ON cat.id    = e."categoryId"
    LEFT JOIN "Participant"    p_paid ON p_paid.id = e."paidById"
    LEFT JOIN "ExpensePaidFor" pf     ON pf."expenseId" = e.id
    GROUP BY e.id, cat.name, p_paid.name
    ORDER BY e."expenseDate" DESC, e."createdAt" DESC
  `)

  await db.end()

  // ── Connect to Google Sheets ──────────────────────────────────────────────

  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })
  _sheets = sheets

  const { data: spreadsheet } = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  })
  let currentSheets = spreadsheet.sheets.map((s) => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId,
  }))
  _knownSheets = currentSheets

  // Desired tabs: one per group + All + Sync Log (never deleted)
  const desiredTitles = [...groups.map((g) => g.name), 'All', SYNC_LOG_TAB]

  // Create any missing tabs
  for (const title of desiredTitles) {
    await ensureTab(sheets, SPREADSHEET_ID, title, currentSheets)
    if (!currentSheets.some((s) => s.title === title)) {
      currentSheets.push({ title, sheetId: null })
    }
  }

  // ── Write per-group tabs ──────────────────────────────────────────────────

  let totalExpenses = 0

  for (const group of groups) {
    const groupParticipants = participants.filter((p) => p.groupId === group.id)
    const groupExpenses = expenses.filter((e) => e.groupId === group.id)
    const ccCode = group.currencyCode || null

    const headers = [
      'Date',
      'Description',
      'Category',
      'Currency',
      'Cost',
      'Original Cost',
      'Original Currency',
      'Conversion Rate',
      'Paid By',
      'Is Reimbursement',
      'Split Mode',
      'Notes',
      ...groupParticipants.map((p) => p.name),
    ]

    const rows = groupExpenses.map((e) => {
      const paidFor = Array.isArray(e.paid_for) ? e.paid_for : []
      const totalShares = paidFor.reduce((s, pf) => s + (pf.shares || 0), 0)
      const digits = getDecimalDigits(ccCode)

      const participantCols = groupParticipants.map((participant) => {
        const pf = paidFor.find((p) => p.participantId === participant.id)
        if (!pf || totalShares === 0) return ''
        const share = (e.amount / totalShares) * pf.shares
        const formatted = (share / Math.pow(10, digits)).toFixed(digits)
        return e.paidById === participant.id ? formatted : `-${formatted}`
      })

      return [
        formatDate(e.expenseDate),
        e.title,
        e.category_name || '',
        ccCode || group.currency,
        formatAmount(e.amount, ccCode),
        e.originalAmount
          ? formatAmount(e.originalAmount, e.originalcurrency)
          : '',
        e.originalcurrency || '',
        e.conversionrate ? Number(e.conversionrate).toString() : '',
        e.paid_by_name || '',
        e.isreimbursement ? 'Yes' : 'No',
        SPLIT_MODE_LABELS[e.splitmode] || e.splitmode,
        e.notes || '',
        ...participantCols,
      ]
    })

    await writeTab(sheets, SPREADSHEET_ID, group.name, [headers, ...rows])
    totalExpenses += groupExpenses.length
    console.log(`✓ ${group.name}: ${groupExpenses.length} expense(s) synced`)
  }

  // ── Write All tab ─────────────────────────────────────────────────────────

  const allHeaders = [
    'Group',
    'Date',
    'Description',
    'Category',
    'Currency',
    'Cost',
    'Original Cost',
    'Original Currency',
    'Conversion Rate',
    'Paid By',
    'Is Reimbursement',
    'Split Mode',
    'Notes',
  ]

  const allRows = []
  for (const group of groups) {
    const ccCode = group.currencyCode || null
    for (const e of expenses.filter((ex) => ex.groupId === group.id)) {
      allRows.push([
        group.name,
        formatDate(e.expenseDate),
        e.title,
        e.category_name || '',
        ccCode || group.currency,
        formatAmount(e.amount, ccCode),
        e.originalAmount
          ? formatAmount(e.originalAmount, e.originalcurrency)
          : '',
        e.originalcurrency || '',
        e.conversionrate ? Number(e.conversionrate).toString() : '',
        e.paid_by_name || '',
        e.isreimbursement ? 'Yes' : 'No',
        SPLIT_MODE_LABELS[e.splitmode] || e.splitmode,
        e.notes || '',
      ])
    }
  }

  await writeTab(sheets, SPREADSHEET_ID, 'All', [allHeaders, ...allRows])
  console.log(`✓ All: ${allRows.length} total expense(s) synced`)

  // ── Remove obsolete tabs (groups deleted from app) ────────────────────────

  const { data: finalSpreadsheet } = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  })
  const finalSheets = finalSpreadsheet.sheets.map((s) => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId,
  }))
  const obsolete = finalSheets.filter(
    (s) => !desiredTitles.includes(s.title),
  )
  // Only delete if there would still be at least one sheet left
  if (obsolete.length > 0 && finalSheets.length > obsolete.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: obsolete.map((s) => ({
          deleteSheet: { sheetId: s.sheetId },
        })),
      },
    })
    console.log(`✓ Removed obsolete tab(s): ${obsolete.map((s) => s.title).join(', ')}`)
  }

  // ── Write success to Sync Log ─────────────────────────────────────────────

  await appendSyncLog(sheets, SPREADSHEET_ID, currentSheets, 'success', groups.length, totalExpenses, null)
  console.log('\nSync complete.')
}

main().catch(async (err) => {
  console.error('Sync failed:', err.message)
  // Best-effort: write failure to Sync Log if we got far enough to have auth
  if (_sheets && SPREADSHEET_ID) {
    try {
      await appendSyncLog(_sheets, SPREADSHEET_ID, _knownSheets, 'failed', 0, 0, err.message)
    } catch (_) {}
  }
  process.exit(1)
})
