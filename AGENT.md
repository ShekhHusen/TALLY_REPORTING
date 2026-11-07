# 🤖 AGENT.md — Developer & AI Agent Knowledge Base

> **Jay Baudhimai Traders — Accounts Reporting & Tally Management Portal**  
> *Last Updated: March 2026 | Version: 2.2.0*  
> **Mandatory Read for all AI Agents and Developers working on this codebase.**

---

## 📑 Table of Contents
1. [Project Overview](#-project-overview)
2. [Tech Stack & Dependencies](#-tech-stack--dependencies)
3. [Repository Structure](#-repository-structure)
4. [Environment & Configuration](#-environment--configuration)
5. [Core Architectural Modules](#-core-architectural-modules)
   - [Authentication & Access Control (RBAC)](#1-authentication--access-control-rbac)
   - [Accounts & Financial Ledger Statements](#2-accounts--financial-ledger-statements)
   - [Transactions & Balance Operations](#3-transactions--balance-operations)
   - [Follow-ups & CRM Reminders](#4-follow-ups--crm-reminders)
   - [Data Import Center](#5-data-import-center)
   - [Tally Live Sync (Read from Tally)](#6-tally-live-sync-read-from-tally)
   - [Tally Live Entry (Write to Tally)](#7-tally-live-entry-write-to-tally)
   - [Fiscal Year Settings & Metadata](#8-fiscal-year-settings--metadata)
6. [Tally Integration Architecture](#-tally-integration-architecture)
   - [TallyPrime XML-over-HTTP Protocol](#tallyprime-xml-over-http-protocol)
   - [CORS & Concurrency Proxy (`tally-proxy`)](#cors--concurrency-proxy-tally-proxy)
   - [Tally TDL Add-on (`JayBaudhimaiWebSync.tdl`)](#tally-tdl-add-on-jaybaudhimaiwebsynctdl)
   - [Two-Way Data Flow & Caching Strategy](#two-way-data-flow--caching-strategy)
   - [Firestore Push Engine (`tallyFirestorePush.js`)](#firestore-push-engine-tallyfirestorepushjs)
7. [Firestore Database Schema](#-firestore-database-schema)
8. [Developer & Agent Operational Rules](#-developer--agent-operational-rules)
9. [Running & Testing the System](#-running--testing-the-system)

---

## 📌 Project Overview

**Jay Baudhimai Traders (JBMT) Accounts Reporting Portal** is a production-grade, full-stack financial accounts dashboard and reporting platform with a deep, bidirectional integration with **TallyPrime**.

### Key Business Goals:
- **Centralized Cloud Visibility:** Provides business owners, accountants, and field agents access to financial accounts, balances, daily ledger statements, and multi-year comparisons on mobile or desktop via web browser.
- **Two-Way TallyPrime Sync:**
  - **Read Sync:** Pulls Ledger Masters, Stock Items, and Vouchers directly from local TallyPrime instances into the browser cache, with audited push to Cloud Firestore.
  - **Write Entry:** Allows accountants to enter Payment, Receipt, Journal, Contra, Sales, and Purchase vouchers directly from the web interface and push them into TallyPrime in real-time.
- **Granular RBAC:** Supports Super Admins, Secondary Admins (tab-restricted), and Single-Account restricted users (e.g., specific party/debtor access).

---

## 🛠️ Tech Stack & Dependencies

| Layer | Technology | Key Details |
|---|---|---|
| **Frontend Framework** | React 19.2 (`react`, `react-dom`) | Modern hooks, strict state isolation, fast rendering |
| **Build & Dev Tool** | Vite 8.2 (`@vitejs/plugin-react`) | Rapid HMR, dev server host `0.0.0.0` port `3000` |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/vite`) | Utility-first, clean slate/modern color palette, custom scrollbars |
| **Cloud Database** | Firebase Firestore 12.18 | Real-time multi-tenant data storage, subcollections for FY balances |
| **Authentication** | Firebase Auth + Custom DB Password | Google OAuth + secure email/password credential fallback |
| **Icons** | Lucide React (`lucide-react` 1.34) | Clean, consistent UI iconography |
| **Document Export** | `jspdf`, `jspdf-autotable`, `xlsx` (SheetJS) | Native client-side PDF and Excel generation |
| **Linter / QA** | Oxlint 1.79 | High-performance static code analysis |
| **Tally Gateway Proxy** | Node.js + Express 5 (`tally-proxy`) | Sequential single-flight request queue + CORS enabler |
| **Tally Plugin** | TDL (`JayBaudhimaiWebSync.tdl` v2.2) | Portable TallyPrime TDL with hotkeys and background runners |

---

## 📁 Repository Structure

```
TALLY_REPORTING/
├── .env.example                       # Firebase environment configuration template
├── AGENT.md                           # ⭐ THIS FILE: Comprehensive project & agent manual
├── AGENT_CONTEXT.md                   # Initial context & development brief
├── TASK_LIST.md                       # Historical task tracker & completion log
├── fy_balance_comparison_plan.md      # Architecture design for multi-FY balance audit
├── index.html                         # SPA root HTML shell
├── package.json                       # Root frontend dependencies & scripts
├── vite.config.js                     # Vite configuration (port 3000, host 0.0.0.0)
├── vercel.json                        # Vercel SPA routing rewrite rules
│
├── public/                            # Static assets
│   ├── LOGO WON.png                   # Brand company logo
│   ├── favicon.svg                    # App favicon
│   └── icons.svg                      # Static vector symbols
│
├── src/                               # Application source code
│   ├── main.jsx                       # React root entrypoint
│   ├── App.jsx                        # App shell, navigation routing, authentication lifecycle
│   ├── firebase.js                    # Firebase SDK configuration & initialization
│   ├── index.css                      # Global styles and Tailwind imports
│   │
│   ├── components/                    # Feature tabs and UI modals
│   │   ├── LoginScreen.jsx            # Multi-provider login (Google Auth + Custom Password)
│   │   ├── UserManagementTab.jsx      # Admin tab: Users, roles, granular tab/account permissions
│   │   ├── AccountsTab.jsx            # Account directory, ledger balances, PDF/Excel reports
│   │   ├── AccountSearchDropdown.jsx  # Reusable instant account search combobox
│   │   ├── AccountStatementModal.jsx  # Full statement modal with daily/running balance
│   │   ├── AccountDeltaModal.jsx      # Balance discrepancy & delta calculation modal
│   │   ├── FYBalanceComparisonModal.jsx # Multi-fiscal year balance comparison & audit modal
│   │   ├── EditAccountModal.jsx       # Modal to update account details
│   │   ├── TransactionsTab.jsx        # Transactions explorer, filtering, voucher list
│   │   ├── TransactionTable.jsx       # Virtualized/paginated transaction table
│   │   ├── EditTransactionModal.jsx   # Edit voucher details with balance recalculation
│   │   ├── PushTransactionModal.jsx   # Manual single-transaction entry
│   │   ├── TodayInterferenceModal.jsx # Audit check for today's transactions
│   │   ├── FollowUpsTab.jsx           # CRM customer payment follow-up manager
│   │   ├── FollowUpModal.jsx          # Create follow-up reminder modal
│   │   ├── UpdateFollowUpModal.jsx    # Update follow-up status & notes modal
│   │   ├── ImportCenter.jsx           # Manual JSON file import for Masters and Vouchers
│   │   ├── TallySyncTab.jsx           # Live read integration: Fetch Ledgers & Vouchers from Tally
│   │   ├── TallyFirestorePushModal.jsx # Staging & confirmation modal to push Tally data to Firestore
│   │   ├── TallyEntryTab.jsx          # Live write integration: Push Accounting/Inventory vouchers to Tally
│   │   └── SettingsTab.jsx            # Fiscal year definitions & system configurations
│   │
│   └── utils/                         # Reusable services, math & integration utilities
│       ├── parser.js                  # ⭐ Tally JSON/tallymessage converter (Masters & Vouchers)
│       ├── tallyService.js            # ⭐ TallyPrime HTTP/XML connector & local cache store
│       ├── tallyFirestorePush.js      # ⭐ Batch push engine: deduplication, balance delta recalculation
│       ├── transactionOperations.js   # Transaction update/delete with automatic running balance repair
│       ├── fiscalYear.js              # Fiscal year detector & Firestore helper
│       └── interestCalculation.js     # Financial interest calculator utility
│
├── tally-proxy/                       # Specialized Express CORS & Queue Gateway
│   ├── package.json                   # Express + Cors dependencies
│   └── server.js                      # Sequential queue server (port 3001 → Tally 9000)
│
├── tally-tdl/                         # TallyPrime Add-on & Helper Scripts
│   ├── JayBaudhimaiWebSync.tdl        # Portable TDL file (Gateway hotkey 'W', F4, F5, F6)
│   ├── INSTALLATION_GUIDE.md          # Setup instructions for client machines
│   ├── setup-folder-path.bat          # Auto-configures proxy-path.cfg
│   ├── start-proxy.bat                # Visible command window proxy launcher
│   ├── start-proxy-silent.vbs         # Background silent proxy launcher (no popup)
│   ├── stop-proxy.bat                 # Kills any running node proxy on port 3001
│   └── proxy-path.cfg                 # Saved proxy folder path for Tally TDL
│
└── integration-setup-lite/            # Standalone Tally connector bundle
    ├── TallyAPIConnectorV2.0.exe      # Compiled GUI connector executable
    └── Company Data/                  # Sample test company datasets
```

---

## ⚙️ Environment & Configuration

Environment variables are defined in `.env` (derived from `.env.example`). When deploying on Vercel or running locally, the following keys are supported:

```ini
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

> **Note on Firebase Fallback:** `src/firebase.js` contains a built-in development fallback configuration for `jbmt-reporting`, ensuring the app can start and run in local dev mode even if `.env` is absent.

---

## 🧩 Core Architectural Modules

### 1. Authentication & Access Control (RBAC)
- **Files:** `src/components/LoginScreen.jsx`, `src/components/UserManagementTab.jsx`, `src/App.jsx`
- **Session Storage:** Current user credentials and permissions are stored in `sessionStorage.getItem('currentUser')`.
- **Roles:**
  - `admin` (Super Admin): Full unrestricted access to all 8 tabs, system settings, and user management.
  - `secondary_admin`: Admin status restricted only to tabs explicitly present in `user.allowedTabs`.
  - `user` (Standard User): Non-admin user. Limited to tabs in `user.allowedTabs`. If `user.allowedAccount` is specified, all account statements and transaction queries are strictly isolated to that specific customer/ledger.
- **Authentication Providers:**
  - Google Sign-In via `firebase/auth`.
  - Custom password authentication with Firestore-backed verification and password reset capability.

### 2. Accounts & Financial Ledger Statements
- **Files:** `src/components/AccountsTab.jsx`, `AccountStatementModal.jsx`, `AccountDeltaModal.jsx`, `FYBalanceComparisonModal.jsx`, `EditAccountModal.jsx`
- **Capabilities:**
  - Searchable, sortable catalog of all accounts (Debtors, Creditors, Banks, Cash, Expenses).
  - Displays Opening Balance, Total Debit, Total Credit, and Closing Balance.
  - **Account Statement Modal:** Generates date-filtered chronological transaction ledgers with dynamic running debit/credit balance, printable view, and client-side PDF/Excel export.
  - **Multi-FY Balance Comparison:** Compares account opening and closing balances across multiple fiscal years to immediately catch carry-forward discrepancies.
  - **Account Delta Audit:** Detects discrepancies between transaction sums and ledger closing balances.

### 3. Transactions & Balance Operations
- **Files:** `src/components/TransactionsTab.jsx`, `TransactionTable.jsx`, `EditTransactionModal.jsx`, `PushTransactionModal.jsx`, `TodayInterferenceModal.jsx`, `src/utils/transactionOperations.js`
- **Capabilities:**
  - Filter transactions by date range, voucher type (Sales, Purchase, Receipt, Payment, Journal, Contra), and involved accounts.
  - Supports multi-ledger transactions (compound entries) with `allDebitEntries` and `allCreditEntries`.
  - **Balance Safety:** Modifying or deleting a voucher must NEVER be a raw Firestore delete. `src/utils/transactionOperations.js` handles reversing old ledger deltas, updating new deltas, and recalculating running balances across the affected fiscal year subcollections.

### 4. Follow-ups & CRM Reminders
- **Files:** `src/components/FollowUpsTab.jsx`, `FollowUpModal.jsx`, `UpdateFollowUpModal.jsx`
- **Capabilities:**
  - Debt recovery and payment collection CRM.
  - Logs customer interaction history, promises to pay, follow-up due dates, and pending/resolved statuses.

### 5. Data Import Center
- **Files:** `src/components/ImportCenter.jsx`, `src/utils/parser.js`
- **Capabilities:**
  - Manual ingestion of exported Tally JSON files (`List of Accounts` and `Voucher Register`).
  - Pre-import validation and interactive preview.
  - Automatic detection and provisioning of missing accounts.
  - Batch commit to Firestore with progress tracking.

### 6. Tally Live Sync (Read from Tally)
- **Files:** `src/components/TallySyncTab.jsx`, `src/utils/tallyService.js`, `src/components/TallyFirestorePushModal.jsx`, `src/utils/tallyFirestorePush.js`
- **Capabilities:**
  - Direct connection to local TallyPrime via `tally-proxy` (`http://localhost:3001` or custom IP).
  - Real-time connection testing and active company detection.
  - **Master Sync:** Fetches all Ledgers and Stock Items using Collection TDL queries; caches in browser `localStorage` (`tallysync_masters`, `tallysync_stock_items`).
  - **Voucher Sync:** Fetches Day Book or Fiscal Year vouchers; caches in `tallysync_txns`.
  - **Firestore Push Engine:** Allows staging, diffing, and pushing cached transactions to Firestore with duplicate prevention (by Tally GUID and voucher number) and incremental balance updates.

### 7. Tally Live Entry (Write to Tally)
- **Files:** `src/components/TallyEntryTab.jsx`, `src/utils/tallyService.js`
- **Capabilities:**
  - Direct reverse integration: Create vouchers in the web app and post directly into TallyPrime!
  - Supports **Accounting Vouchers** (Payment, Receipt, Journal, Contra) and **Inventory Vouchers** (Sales, Purchase with Stock Items, Quantities, Rates, and Unit Measures).
  - Features a searchable combobox (`MasterCombobox`) using cached masters.
  - Generates Tally-compliant XML (`buildAccountingVoucherXML`, `buildInvoiceVoucherXML`) and delivers via HTTP POST to `postVoucherToTally()`.
  - Provides XML preview modal and maintains a local submission log.

### 8. Fiscal Year Settings & Metadata
- **Files:** `src/components/SettingsTab.jsx`, `src/utils/fiscalYear.js`
- **Capabilities:**
  - Defines fiscal year spans (e.g. `2025-04-01` to `2026-03-31`).
  - Automatically tags transactions with the active fiscal year ID.
  - Tracks system metadata and sync timestamps in Firestore `system/metadata`.

---

## 🔌 Tally Integration Architecture

### TallyPrime XML-over-HTTP Protocol
TallyPrime includes an internal HTTP server that listens on port **9000** (configurable in Tally via `F1` → `Settings` → `Connectivity`).
All communication uses HTTP `POST` with `Content-Type: text/xml`.

#### Why Collection TDL Queries are Used:
Standard report exports (`<REPORTNAME>List of Accounts</REPORTNAME>`) vary wildly across Tally releases and often do not support JSON export in educational or older versions. This project uses **Collection-based TDL queries**:
```xml
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>CustomLedgerList</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>Jay Baudhimai Traders</SVCURRENTCOMPANY>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="CustomLedgerList" ISINITIALIZE="Yes">
            <TYPE>Ledger</TYPE>
            <FETCH>NAME, PARENT, OPENINGBALANCE, CLOSINGBALANCE, ADDRESS.LIST, LEDGERPHONE, LEDGERMOBILE, GUID</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
```

---

### CORS & Concurrency Proxy (`tally-proxy`)
Modern web browsers enforce CORS (Cross-Origin Resource Sharing). Because TallyPrime's native HTTP server does NOT send CORS headers, direct `fetch('http://localhost:9000')` calls from browser applications will be blocked.

Furthermore, **TallyPrime's internal C++ XML engine is strictly single-threaded**. If two requests hit port 9000 at the same time, TallyPrime will instantly crash with an unhandled memory exception:
`c0000005 (Access Violation)`.

#### The Solution: `tally-proxy/server.js`
The proxy runs on port **3001** (or custom) and provides:
1. **Full CORS Headers:** Allows web browser origins to communicate seamlessly.
2. **Single-Flight Sequential Execution Queue:** Enforces that only **one request** is forwarded to Tally at a time via `runSequentially()`.
3. **40ms Engine Breathing Delay:** Introduces a 40ms pause between completed requests to let Tally's memory buffers flush.
4. **`Connection: close` Header:** Disables persistent keep-alive sockets which can hang Tally during company switches.
5. **Real-time Health Check:** `GET /health` tests Tally connectivity and reports round-trip latency.

---

### Tally TDL Add-on (`JayBaudhimaiWebSync.tdl`)
The `tally-tdl/` folder contains a portable Tally Definition Language (TDL) file loaded into TallyPrime:
- **Hotkey `W` at Gateway of Tally:** Opens the Web Sync Connector configuration screen.
- **Dual Path Configuration:** Allows specifying independent paths for the TDL directory and the Node proxy directory.
- **Controls & Hotkeys:**
  - `F4`: Open Web Reporting Portal in default browser (`http://localhost:3000`).
  - `F5`: Launch the Node proxy server silently in the background (`start-proxy-silent.vbs`).
  - `F6`: Kill the proxy server (`stop-proxy.bat`).
  - `Alt + W`: Toggle Web Sync enabled/disabled.

---

### Two-Way Data Flow & Caching Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                              WEB BROWSER                               │
│  ┌─────────────────────────┐            ┌───────────────────────────┐  │
│  │   TallySyncTab (Read)   │            │   TallyEntryTab (Write)   │  │
│  └────────────┬────────────┘            └─────────────┬─────────────┘  │
│               │                                       │                │
│       localStorage Cache                              │                │
│  (tallysync_masters, txns)                            │                │
│               │                                       │                │
│               ▼                                       ▼                │
│       src/utils/tallyService.js ◄─────────────────────┘                │
└───────────────┬────────────────────────────────────────────────────────┘
                │ HTTP POST (XML Payload)
                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   TALLY-PROXY (Port 3001 / Express)                    │
│     • CORS Headers                                                     │
│     • Sequential Queue Guard (1 at a time)                             │
│     • 40ms Breathing Pause                                             │
└───────────────┬────────────────────────────────────────────────────────┘
                │ Sequential Forwarding (Port 9000)
                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        TALLYPRIME (Port 9000)                          │
│               • Reads Ledger & Voucher Collections                     │
│               • Inserts New Vouchers via Import TDL                    │
└────────────────────────────────────────────────────────────────────────┘
```

#### Local Storage Cache Keys
- `tallysync_url`: Saved Proxy/Tally URL (e.g. `http://localhost:3001`).
- `tallysync_company`: Currently selected company name.
- `tallysync_masters`: Array of parsed Ledger accounts.
- `tallysync_masters_ts`: ISO timestamp of master sync.
- `tallysync_stock_items`: Array of parsed Stock Items.
- `tallysync_stock_items_ts`: ISO timestamp of stock item sync.
- `tallysync_txns`: Array of parsed vouchers.
- `tallysync_txns_ts`: ISO timestamp of transaction sync.

---

### Firestore Push Engine (`tallyFirestorePush.js`)
When an admin clicks **"Push to Firebase"** in the Tally Sync tab:
1. **Pre-flight Check:** Opens `TallyFirestorePushModal.jsx` displaying total count, breakdown by voucher type, and warning of any new accounts that will be created.
2. **Deduplication:** Checks existing Firestore transactions using Tally GUID and voucher number to prevent duplicate records.
3. **Auto-Account Provisioning:** Any debit/credit ledger not existing in Firestore `accounts` is automatically created under the correct group with an auto-provisioned flag.
4. **Incremental Balance Recalculation:** Computes exact delta amounts (Dr/Cr) for each account affected by new vouchers and updates both the root account document and the `accounts/{id}/fiscalYears/{fyId}` subcollection.
5. **Metadata Update:** Updates `system/metadata` with the latest sync date, new transaction count, and executor identity.

---

## 🗄️ Firestore Database Schema

### 1. `accounts` (Collection)
```typescript
interface Account {
  id: string;                     // GUID (from Tally) or Firestore doc ID
  name: string;                   // E.g., "Cash", "Shree Ram Enterprises"
  group: string;                  // E.g., "Sundry Debtors", "Sundry Creditors"
  openingBalance: number;         // Opening balance amount
  openingBalanceType: 'Dr' | 'Cr' | ''; // Dr = Debit, Cr = Credit
  closingBalance?: number;        // Latest calculated balance
  closingBalanceType?: 'Dr' | 'Cr' | '';
  address?: string;               // Postal/business address
  contact?: string;               // Mobile or phone number
  isNewAutoCreated?: boolean;     // True if automatically provisioned during sync
}
```

#### Subcollection: `accounts/{accountId}/fiscalYears/{fyId}`
```typescript
interface AccountFYBalance {
  fyId: string;                   // E.g., "FY-2025-26"
  fyName: string;                 // E.g., "FY 2025-26"
  openingBalance: number;
  openingBalanceType: 'Dr' | 'Cr' | '';
  totalDebit: number;             // Sum of all debits in this FY
  totalCredit: number;            // Sum of all credits in this FY
  closingBalance: number;         // Computed net closing balance
  closingBalanceType: 'Dr' | 'Cr' | '';
  verifiedBy?: string | null;     // Admin who verified balance
  verifiedAt?: string | null;     // Timestamp of verification
}
```

### 2. `transactions` (Collection)
```typescript
interface Transaction {
  id: string;                     // Tally GUID or auto-generated ID
  date: string;                   // "YYYY-MM-DD"
  type: string;                   // "Sales" | "Purchase" | "Receipt" | "Payment" | "Journal" | "Contra"
  voucherNo: string;              // Voucher number string
  debitAccount: string;           // Primary debit account name
  debitAmount: number;            // Total debit amount
  creditAccount: string;          // Primary credit account name
  creditAmount: number;           // Total credit amount
  allDebitEntries: Array<{ name: string; amount: number }>;
  allCreditEntries: Array<{ name: string; amount: number }>;
  allDebitAccounts: string[];     // Array of debit account names for indexing
  allCreditAccounts: string[];    // Array of credit account names for indexing
  involvedAccountsLower: string[];// Lowercase account names for case-insensitive search
  involvedAccountIds: string[];   // Account document IDs
  inventory?: Array<{ itemName: string; qty: number; rate: number; amount: number }>;
  narration?: string;             // Voucher narration/remarks
  enteredBy?: string;             // User name / "Tally Live Sync"
  fyId?: string;                  // Fiscal year ID
  tallyGuid?: string;             // Unique Tally GUID for deduplication
}
```

### 3. `fiscalYears` (Collection)
```typescript
interface FiscalYear {
  id: string;                     // Auto-generated ID
  name: string;                   // "FY 2025-26"
  startDate: string;              // "2025-04-01"
  endDate: string;                // "2026-03-31"
  createdBy: string;
  createdAt: string;              // ISO timestamp
}
```

### 4. `users` (Collection)
```typescript
interface User {
  id: string;                     // UID
  name: string;                   // Display name
  email: string;                  // User email
  role: 'admin' | 'secondary_admin' | 'user';
  adminType?: 'super' | 'secondary';
  allowedTabs: string[];          // Array of permitted tab IDs: ['accounts', 'transactions']
  allowedAccount?: string | null; // Account restriction (null = all accounts)
  password?: string;              // Custom password
  createdAt: string;
  lastLogin?: string;
}
```

### 5. `followups` (Collection)
```typescript
interface FollowUp {
  id: string;
  accountId: string;
  accountName: string;
  contact?: string;
  amount?: number;
  dueDate: string;                // "YYYY-MM-DD"
  status: 'pending' | 'completed' | 'rescheduled';
  notes: string;
  history: Array<{ date: string; note: string; updatedBy: string }>;
  createdAt: string;
  createdBy: string;
}
```

### 6. `system/metadata` (Document)
```typescript
interface SystemMetadata {
  lastUpdatedDate: string;        // "YYYY-MM-DD" of the most recent voucher
  lastSyncTimestamp: string;      // ISO string
  totalVouchers?: number;
  syncedBy?: string;
}
```

---

## ⚠️ Developer & Agent Operational Rules

When modifying or adding features to this codebase, all AI agents and developers **MUST follow these rules strictly**:

1. **NEVER Bypass the Proxy for Tally Writes/Reads:**
   - Always route Tally requests through `tally-proxy` (`port 3001`). Direct browser calls to port 9000 violate CORS and can crash Tally with concurrent requests.
2. **NEVER Directly Mutate Account Balances Without Delta Logic:**
   - Account balances are cumulative. If you update or delete a transaction, you must recalculate the delta and adjust both the root `accounts` balance and the active `accounts/{id}/fiscalYears/{fyId}` subcollection using `transactionOperations.js` or `tallyFirestorePush.js`.
3. **Date Format Conversions:**
   - Tally API expects dates as `YYYYMMDD` (e.g. `20260401`).
   - Web application and Firestore store dates as `YYYY-MM-DD` (e.g. `2026-04-01`).
   - Educational mode in Tally only accepts dates ending in `01`, `02`, or `31`.
4. **Preserve UI Consistency:**
   - Tailwind styling rules: Cards use `bg-white rounded-2xl shadow-sm border border-slate-200/60`.
   - Header labels use `font-black text-slate-900 tracking-tight`.
   - Buttons use `rounded-xl font-bold text-sm px-4 py-2`.
   - Icons must come from `lucide-react`.
5. **Local-First Caching for Tally Sync:**
   - Data fetched from Tally should always be cached in `localStorage` first before pushing to Firestore. Do NOT auto-push to Firestore without user consent.
6. **Maintain Reactive Global State:**
   - When new data is written to Firestore (via import, manual push, or Tally push), trigger `setUpdateTrigger(prev => prev + 1)` so all tabs immediately reflect the new state without a page refresh.

---

## 🚀 Running & Testing the System

### 1. Frontend Web Application
```bash
# Start Vite development server (Port 3000, 0.0.0.0)
npm start
# Alternatively:
npm run dev

# Run Production Build
npm run build

# Run Code Linter
npm run lint
```
The application will be accessible at: **`http://localhost:3000`**

### 2. Tally CORS & Concurrency Proxy
```bash
# Navigate to proxy directory
cd tally-proxy

# Install dependencies (Express, Cors)
npm install

# Start the proxy (Listens on port 3001, forwards to Tally port 9000)
npm start
```
Health check endpoint: **`http://localhost:3001/health`**

### 3. TallyPrime TDL Setup
1. Launch TallyPrime.
2. Press **`F1` (Help)** → **`TDLs & Add-Ons`** → **`F4` (Manage Local TDLs)**.
3. Add `tally-tdl\JayBaudhimaiWebSync.tdl` and press `Ctrl+A`.
4. Press **`W`** on Gateway of Tally.
5. Verify/set the TDL folder path and Proxy folder path, then press `Ctrl+A`.
6. Press **`F5`** to launch the proxy, or **`F4`** to launch the web portal.
