# 📋 TASK LIST — Tally Sync Integration

> **Status Legend:** ⬜ Not Started | 🔄 In Progress | ✅ Done | ❌ Blocked  
> **Priority:** 🔴 Critical | 🟡 Important | 🟢 Nice-to-have

---

## Pre-Work
- [x] Project analysis complete
- [x] TallyPrime API research complete
- [x] Agent context file (`AGENT_CONTEXT.md`) created
- [x] Task list (`TASK_LIST.md`) created

---

## Task 1: Tally Connection Service ✅ 🔴

**File to Create:** `src/utils/tallyService.js`  
**Dependencies:** None  
**Estimated LOC:** ~200

### What to Build:
A utility module that handles all communication with TallyPrime API.

### Sub-tasks:
- [ ] **1.1** `sendTallyRequest(xmlPayload, tallyUrl)` — Core HTTP POST function that sends XML to Tally and returns parsed response
- [ ] **1.2** `testConnection(tallyUrl)` — Sends "List of Companies" request to verify Tally is reachable, returns `{ connected: boolean, companies: string[], error?: string }`
- [ ] **1.3** `fetchCompanyList(tallyUrl)` — Returns array of company names loaded in Tally
- [ ] **1.4** `fetchLedgerMasters(companyName, tallyUrl)` — Builds XML for exporting all ledgers in JSON format, sends request, returns raw JSON response (the `tallymessage` array)
- [ ] **1.5** `fetchVouchers(companyName, fromDate, toDate, tallyUrl)` — Builds XML for exporting vouchers in date range, returns raw JSON response
- [ ] **1.6** `fetchDayBook(companyName, fromDate, toDate, tallyUrl)` — Alternative voucher fetch via Day Book report
- [ ] **1.7** XML builder helper functions — `buildListCompaniesXML()`, `buildLedgerExportXML()`, `buildVoucherExportXML()`
- [ ] **1.8** `parseXMLResponse(xmlText)` — Convert XML string to JSON using DOMParser (only needed if Tally returns XML instead of JSON)
- [ ] **1.9** Error handling wrapper — Catch network errors, timeout, CORS, Tally-specific errors

### Input/Output:
- **Input:** Tally URL (default `http://localhost:9000`), company name, date range
- **Output:** Raw Tally JSON (same format as file exports, compatible with `parser.js`)

### Key Details:
- Dates sent to Tally must be `YYYYMMDD` format (e.g., `20260401`)
- Request JSON export format using `<SVEXPORTFORMAT>$$SysName:JSON</SVEXPORTFORMAT>`
- The JSON response from Tally API has same structure as manual JSON file exports → `parser.js` can parse it directly
- Handle both XML and JSON responses (older Tally may not support JSON export)

---

## Task 2: Tally Sync Tab — Core Component ✅ 🔴

**File to Create:** `src/components/TallySyncTab.jsx`  
**Dependencies:** Task 1 (tallyService.js)  
**Estimated LOC:** ~600-800

### What to Build:
A new full tab component for all Tally sync operations. All data stays LOCAL (localStorage + React state). NO Firestore writes.

### Sub-tasks:
- [ ] **2.1** Component scaffold with state management:
  - `tallyUrl` (default: `http://localhost:9000`, saved in localStorage)
  - `connectionStatus` (`idle` | `connecting` | `connected` | `error`)
  - `companies` (list from Tally)
  - `selectedCompany` (saved in localStorage)
  - `syncStatus` (per-operation progress)
  - `cachedMasters` (parsed ledger data in localStorage)
  - `cachedTransactions` (parsed voucher data in localStorage)
  
- [ ] **2.2** Connection Panel UI:
  - Tally URL input field (editable, default `http://localhost:9000`)
  - "Test Connection" button → calls `testConnection()`
  - Connection status indicator (🔴 Disconnected / 🟡 Connecting / 🟢 Connected)
  - Company dropdown (populated after successful connection)
  - Save connection settings to localStorage
  
- [ ] **2.3** Master Sync Section:
  - "Fetch Masters from Tally" button
  - Calls `fetchLedgerMasters()` → passes response through `processMaster()` from `parser.js`
  - Stores parsed accounts array in localStorage key `tallysync_masters`
  - Shows count: "245 ledger accounts fetched"
  - "Preview" button → shows data table (reuse pattern from ImportCenter preview)
  
- [ ] **2.4** Transaction Sync Section:
  - Fiscal Year selector (fetch FY list from Firestore — READ only)
  - "Fetch Transactions from Tally" button
  - Calls `fetchVouchers()` with FY date range → passes through `processTransactions()` from `parser.js`
  - Stores parsed transactions in localStorage key `tallysync_transactions`
  - Shows count + date range
  - "Preview" button → shows transaction preview table
  
- [ ] **2.5** Sync Summary Panel:
  - Last sync timestamp
  - Masters count
  - Transactions count
  - Cache size info
  - "Clear Cache" button
  
- [ ] **2.6** Data Preview Modal/Section:
  - Tabular preview of fetched data (masters or transactions)
  - Search/filter within preview
  - Scrollable, paginated
  - Expandable rows for multi-entry vouchers

### Data Storage Strategy:
```
localStorage keys:
  tallysync_url          → string (Tally URL)
  tallysync_company      → string (selected company name)
  tallysync_masters      → JSON string (parsed master accounts array)
  tallysync_masters_ts   → ISO timestamp of last master sync
  tallysync_txns         → JSON string (parsed transactions array)
  tallysync_txns_ts      → ISO timestamp of last txn sync
  tallysync_txns_fy      → JSON string (FY object used for last txn sync)
```

### UI Layout:
```
┌──────────────────────────────────────────────────────┐
│ ⚡ TALLY SYNC                                        │
├──────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────┐ │
│ │ 🔌 CONNECTION                                    │ │
│ │ URL: [http://localhost:9000] [Test Connection]    │ │
│ │ Status: 🟢 Connected                            │ │
│ │ Company: [▼ Jay Baudhimai Traders ]              │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─────────────────────┐ ┌────────────────────────┐  │
│ │ 📋 MASTERS          │ │ 📊 TRANSACTIONS        │  │
│ │                     │ │                        │  │
│ │ Last: 25 Oct 12:00  │ │ FY: [▼ FY 2025-26]    │  │
│ │ Count: 245 ledgers  │ │ Last: 25 Oct 12:05    │  │
│ │                     │ │ Count: 1,240 vouchers  │  │
│ │ [🔄 Fetch Masters]  │ │ [🔄 Fetch Transactions]│  │
│ │ [👁️ Preview]        │ │ [👁️ Preview]           │  │
│ └─────────────────────┘ └────────────────────────┘  │
│                                                      │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 📈 SYNC SUMMARY                                  │ │
│ │ Cache: 2.4 MB | [🗑️ Clear Cache]                 │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

---

## Task 3: Register Tally Sync Tab in App.jsx ✅ 🔴

**File to Modify:** `src/App.jsx`  
**Dependencies:** Task 2  
**Estimated Changes:** ~15 lines

### Sub-tasks:
- [ ] **3.1** Import `TallySyncTab` component at top of file
- [ ] **3.2** Import `RefreshCw` icon from lucide-react
- [ ] **3.3** Add nav item to `NAV_ITEMS` array:
  ```javascript
  { id: 'tallysync', label: 'Tally Sync', icon: RefreshCw, adminOnly: true },
  ```
  Place it AFTER 'import' and BEFORE 'settings' in the array.
- [ ] **3.4** Add render block for tallysync tab in the main content area (follow exact pattern of other tabs):
  ```jsx
  <div style={{ display: (activeTab === 'tallysync' && hasTabAccess('tallysync')) ? 'flex' : 'none' }} className="flex-1 min-h-0 flex-col">
      {activeTab === 'tallysync' && hasTabAccess('tallysync') && <TallySyncTab currentUser={currentUser} />}
  </div>
  ```

---

## Task 4: CORS Testing & Proxy (If Needed) ✅ 🟡

**Dependencies:** Task 1  
**Conditional:** Only if direct fetch to `localhost:9000` gets CORS error

### Sub-tasks:
- [ ] **4.1** Test direct fetch from browser to `http://localhost:9000` with Tally running
- [ ] **4.2** Test fetch via TallyAPIConnectorV2.0 (it may use a different port with CORS headers)
- [ ] **4.3** If CORS fails → Create `tally-proxy/` directory with:
  - `tally-proxy/package.json` (express, cors dependencies)
  - `tally-proxy/server.js` (simple Express proxy: port 3001 → forwards to 9000)
  - Instructions to run: `cd tally-proxy && npm install && node server.js`
- [ ] **4.4** If proxy needed → Update default URL in `tallyService.js` to `http://localhost:3001/tally`

---

## Task 5: Enhanced Data Preview ✅ 🟡

**File to Modify:** `src/components/TallySyncTab.jsx` (part of Task 2)  
**Dependencies:** Task 2

### Sub-tasks:
- [ ] **5.1** Master Preview Table:
  - Columns: Name, Group, Opening Balance, Type, Address, Contact
  - Search by name
  - Sort by any column
  - Pagination (50 per page)
  
- [ ] **5.2** Transaction Preview Table:
  - Columns: Date, Type, Vch No, Debit Account, Credit Account, Amount, Narration
  - Filter by date, voucher type
  - Sort by date/amount
  - Expandable rows for multi-ledger entries
  - Pagination

- [ ] **5.3** Comparison view (optional):
  - Compare cached data with current Firestore data
  - Show new accounts, changed amounts
  - Delta summary

---

## Task 6: Local Data Inspection Tools ✅ 🟢

**Dependencies:** Task 2

### Sub-tasks:
- [ ] **6.1** JSON export button — download cached data as JSON file for manual inspection
- [ ] **6.2** Search across all cached data
- [ ] **6.3** Statistics panel:
  - Total accounts count
  - By group breakdown
  - Total vouchers count
  - By voucher type breakdown
  - Date range of transactions
  - Total debit/credit amounts

---

## Task 7: Future — Firestore Push (NOT NOW) ⬜ 🟢

> ⛔ **DO NOT IMPLEMENT YET.** This is documented for future reference only.
> User will explicitly request this after testing the local sync.

### Future sub-tasks (placeholder):
- [ ] **7.1** "Push to Firestore" button for masters
- [ ] **7.2** "Push to Firestore" button for transactions
- [ ] **7.3** Reuse ImportCenter's `processAffectedAccounts()` and `syncBalancesForImportedAccounts()` logic
- [ ] **7.4** Delta sync (only push changed records)

---

## Execution Order

```
Task 1 (tallyService.js)
    ↓
Task 2 (TallySyncTab.jsx) + Task 3 (App.jsx registration)
    ↓
Task 4 (CORS test — may be concurrent with Task 2)
    ↓
Task 5 (Enhanced preview)
    ↓
Task 6 (Inspection tools)
    ↓
[STOP — Wait for user testing]
    ↓
Task 7 (Firestore push — FUTURE, on user request only)
```

---

## Quick Reference: What Changes Where

| File | Action | Task |
|------|--------|------|
| `src/utils/tallyService.js` | 🆕 Create | Task 1 |
| `src/components/TallySyncTab.jsx` | 🆕 Create | Task 2 |
| `src/App.jsx` | ✏️ Add import, nav item, render block | Task 3 |
| `tally-proxy/server.js` | 🆕 Create (conditional) | Task 4 |
| `tally-proxy/package.json` | 🆕 Create (conditional) | Task 4 |

---

## Notes for Agents

1. **Read `AGENT_CONTEXT.md` first** before working on any task.
2. **Follow existing code patterns** — look at ImportCenter.jsx for reference.
3. **Use Tailwind CSS** with the same design language (rounded-2xl, slate colors, shadow-sm).
4. **Use lucide-react** for all icons.
5. **NO Firestore writes** from TallySyncTab — only reads (for FY list) are allowed.
6. **Test with** `npm run dev` (Vite dev server on port 3000).
7. **localStorage keys** must be prefixed with `tallysync_` to avoid conflicts.
