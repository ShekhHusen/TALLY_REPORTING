# 🤖 AGENT CONTEXT FILE — Tally Sync Integration

> **MANDATORY READ:** Koi bhi agent is project pe kaam karne se pehle yeh file poora padhe.
> Isse aapko pura project samajh aa jaayega bina har file padhne ki zaroorat ke.

---

## 📌 Project Overview

**Project Name:** Jay Baudhimai Traders — Accounts Reporting Portal  
**Root Directory:** `c:\Users\dell\Documents\GitHub\TALLY_REPORTING`  
**Purpose:** Financial accounts reporting dashboard for a trading business.  
**Current Status:** Working production app on Vercel. Now adding TallyPrime Live Sync feature.

---

## 🛠️ Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Frontend | React (JSX) | 19.2 |
| Build Tool | Vite | 8.2 |
| CSS | Tailwind CSS (via `@tailwindcss/vite` plugin) | 4.3 |
| Database | Firebase Firestore | 12.18 |
| Auth | Firebase Auth (Google + Custom Password) | — |
| Hosting | Vercel | — |
| Icons | lucide-react | 1.34 |
| PDF Export | jspdf + jspdf-autotable | — |
| Excel Export | xlsx (SheetJS) | 0.18 |
| Dev Server | `http://localhost:3000` | — |

---

## 📁 Project Structure (Key Files Only)

```
TALLY_REPORTING/
├── src/
│   ├── main.jsx                      # Entry point → renders <App />
│   ├── App.jsx                       # Main app shell, routing, nav, auth
│   ├── firebase.js                   # Firebase config & initialization
│   ├── index.css                     # Global styles (Tailwind)
│   ├── components/
│   │   ├── LoginScreen.jsx           # Login UI (Google Auth + custom password)
│   │   ├── UserManagementTab.jsx     # Admin user management (tab: 'users')
│   │   ├── AccountsTab.jsx           # Account directory + detail view (tab: 'accounts')
│   │   ├── TransactionsTab.jsx       # Transaction list/filter (tab: 'transactions')
│   │   ├── FollowUpsTab.jsx          # Follow-up management (tab: 'followups')
│   │   ├── ImportCenter.jsx          # JSON file import for masters/transactions (tab: 'import')
│   │   ├── SettingsTab.jsx           # Fiscal Year management (tab: 'settings')
│   │   ├── AccountSearchDropdown.jsx # Reusable account search
│   │   ├── AccountStatementModal.jsx # Statement view modal
│   │   ├── AccountDeltaModal.jsx     # Delta calculation modal
│   │   ├── EditAccountModal.jsx      # Edit account details
│   │   ├── EditTransactionModal.jsx  # Edit transaction details
│   │   ├── FollowUpModal.jsx         # Create follow-up
│   │   ├── UpdateFollowUpModal.jsx   # Update follow-up
│   │   ├── FYBalanceComparisonModal.jsx # Multi-FY balance comparison
│   │   ├── PushTransactionModal.jsx  # Manual transaction push
│   │   └── TransactionTable.jsx      # Reusable transaction table
│   └── utils/
│       ├── parser.js                 # ⭐ Tally JSON parser (master + transactions)
│       ├── fiscalYear.js             # FY fetch & current-FY detection
│       ├── transactionOperations.js  # Delete/update transaction with balance recalc
│       └── interestCalculation.js    # Interest computation utility
├── integration-setup-lite/
│   ├── TallyAPIConnectorV2.0.exe     # ⭐ Tally's official API proxy connector
│   └── Company Data/                 # Sample Tally company data for testing
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── LOGO WON.png                 # Company logo
├── package.json
├── vite.config.js                    # Vite config (port 3000, host 0.0.0.0)
├── vercel.json                       # SPA rewrite rules
├── index.html                        # HTML shell
├── .env.example                      # Firebase env vars template
└── metadata.json                     # App metadata
```

---

## 🧭 App Navigation (App.jsx NAV_ITEMS)

```javascript
const NAV_ITEMS = [
    { id: 'users',        label: 'Users',        icon: Users,          adminOnly: true },
    { id: 'accounts',     label: 'Accounts',     icon: Briefcase },
    { id: 'transactions', label: 'Transactions', icon: ArrowRightLeft },
    { id: 'followups',    label: 'Follow-ups',   icon: Clock },
    { id: 'import',       label: 'Import',       icon: UploadCloud },
    { id: 'settings',     label: 'Settings',     icon: Settings,       adminOnly: true },
];
```

**New tab to add:** `{ id: 'tallysync', label: 'Tally Sync', icon: RefreshCw, adminOnly: true }`

---

## 🔥 Firestore Data Model

### Collection: `accounts`
```
{
  id: string,           // UUID (from Tally GUID)
  name: string,         // Ledger name (e.g., "Cash", "SBI Bank")
  group: string,        // Account group (e.g., "Sundry Debtors")
  openingBalance: number,
  openingBalanceType: 'Dr' | 'Cr' | '',
  address: string,
  contact: string,
  isNewAutoCreated: boolean  // Auto-created during transaction import
}
```
**Subcollection:** `accounts/{id}/fiscalYears/{fyId}`
```
{
  fyId: string,
  fyName: string,
  openingBalance: number,
  openingBalanceType: string,
  totalDebit: number,
  totalCredit: number,
  closingBalance: number,
  closingBalanceType: string,
  verifiedBy: string | null,
  verifiedAt: string | null
}
```

### Collection: `transactions`
```
{
  id: string,                   // UUID (from Tally GUID)
  date: string,                 // "YYYY-MM-DD"
  type: string,                 // Voucher type (e.g., "Sales", "Receipt", "Journal")
  voucherNo: string,
  debitAccount: string,         // Primary debit account name
  debitAmount: number,          // Total debit amount
  creditAccount: string,        // Primary credit account name
  creditAmount: number,         // Total credit amount
  allDebitEntries: [{ name, amount }],    // All debit ledger entries
  allCreditEntries: [{ name, amount }],   // All credit ledger entries
  allDebitAccounts: [string],             // Unique debit account names
  allCreditAccounts: [string],            // Unique credit account names
  involvedAccountsLower: [string],        // Lowercase account names for querying
  involvedAccountIds: [string],           // Firestore doc IDs of involved accounts
  inventory: [{ itemName, qty, rate, amount }],
  narration: string,
  enteredBy: string
}
```

### Collection: `fiscalYears`
```
{
  name: string,       // "FY 2025-26"
  startDate: string,  // "2025-04-01"
  endDate: string,    // "2026-03-31"
  createdBy: string,
  createdAt: string   // ISO timestamp
}
```

### Other: `users`, `system/metadata`

---

## ⭐ parser.js — THE CRITICAL FILE

**Location:** `src/utils/parser.js`

This parser converts **Tally's JSON export format** into the Firestore-compatible data structure. The Tally API also returns data in the same `tallymessage` format. This is the bridge.

### Key Functions:
- `processMaster(json)` — Parses `json.tallymessage` where `metadata.type === 'Ledger'` → extracts name, group, openingBalance, address, contact
- `processTransactions(json)` — Parses where `metadata.type === 'Voucher'` → extracts date, type, voucherNo, all debit/credit entries, inventory, narration

### Input Format (from Tally):
```json
{
  "tallymessage": [
    {
      "metadata": { "type": "Ledger", "name": "Cash" },
      "parent": "Cash-in-Hand",
      "openingbalance": "50000",
      "guid": "abc-123-..."
    },
    {
      "metadata": { "type": "Voucher" },
      "date": "20260415",
      "vouchertypename": "Sales",
      "vouchernumber": "S-001",
      "allledgerentries": [...],
      "narration": "..."
    }
  ]
}
```

---

## 🔌 TallyPrime API — How It Works

### Architecture
```
TallyPrime (Port 9000) ← XML over HTTP POST → TallyAPIConnectorV2.0.exe (Proxy) ← HTTP → Browser
```

### Request Format
- **Method:** POST
- **URL:** `http://localhost:9000` (or connector's port)
- **Content-Type:** `text/xml`
- **Body:** XML `<ENVELOPE>` structure

### Key XML Templates

**List Companies:**
```xml
<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>List of Companies</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></DESC></BODY></ENVELOPE>
```

**Export Ledgers (JSON format):**
```xml
<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST><TYPE>Data</TYPE><ID>All Ledgers</ID></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Accounts</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{COMPANY}</SVCURRENTCOMPANY><SVEXPORTFORMAT>$$SysName:JSON</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>
```

**Export Vouchers (JSON format):**
```xml
<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST><TYPE>Data</TYPE><ID>Voucher Register</ID></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{COMPANY}</SVCURRENTCOMPANY><SVFROMDATE>{YYYYMMDD}</SVFROMDATE><SVTODATE>{YYYYMMDD}</SVTODATE><SVEXPORTFORMAT>$$SysName:JSON</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>
```

**Date Format in API:** `YYYYMMDD` (e.g., `20260401`)

### JSON Export (`$$SysName:JSON`)
When using JSON export format, Tally returns data in the SAME `tallymessage` format that `parser.js` already handles. This means **no new parser is needed for master/transaction sync**.

---

## 🎯 Current Task: Tally Sync Tab (LOCAL/CACHE ONLY)

### What to Build:
A new **"Tally Sync"** tab (`id: 'tallysync'`) in the app that:
1. Connects to TallyPrime via the API Connector
2. Fetches Masters (Ledgers) and Transactions (Vouchers)
3. **Stores ALL data locally** (localStorage/state) — NOT in Firestore
4. Provides preview/inspection UI for fetched data
5. Later (user decides when), data will be pushed to Firestore

### Key Rules:
- ❌ **NO Firestore writes** from Tally Sync tab for now
- ✅ Use `localStorage` or React state for cached data
- ✅ Reuse `processMaster()` and `processTransactions()` from `parser.js`
- ✅ Handle CORS (test direct first, proxy if needed)
- ✅ All Tally Sync operations behind `adminOnly: true`

---

## 🧩 Code Patterns to Follow

### Adding a New Tab:
1. **App.jsx:** Add to `NAV_ITEMS` array, import component, add render block
2. **Component:** Create in `src/components/`, follow existing patterns
3. **Icons:** Use `lucide-react` icons

### UI Styling Patterns:
- Cards: `bg-white rounded-2xl shadow-sm border border-slate-200/60`
- Headers: `text-lg font-black text-slate-900 tracking-tight`
- Buttons: `bg-{color}-600 hover:bg-{color}-700 text-white px-4 py-2 rounded-xl text-sm font-bold`
- Status badges: `text-xs px-2 py-1 rounded-full font-bold`
- Input fields: `w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-{color}-500/20`

### File Import Pattern (ImportCenter.jsx):
```javascript
// Current flow: File → FileReader → parse JSON → preview → save
// New flow: Tally API → fetch → parse JSON → preview → cache locally
```

---

## ⚠️ Critical Constraints

1. **CORS:** Browser may block `localhost:9000`. TallyAPIConnectorV2.0 may handle CORS. Test first.
2. **Tally must be running** on the same machine for sync to work.
3. **Company name must match exactly** what's loaded in Tally.
4. **Educational Mode** limits dates to 1st, 2nd, 31st of any month.
5. **FY dates** format in Tally: `YYYYMMDD`, in app: `YYYY-MM-DD`.

---

## 📎 Task List Reference

See `TASK_LIST.md` in the same directory for the detailed task breakdown.
