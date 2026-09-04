# Performance Optimization & Firestore Read Reduction Plan

## Problem Overview
Currently, the application fetches the **entire** `accounts` and `transactions` collections (up to 50k records) on load. This causes severe lag, excessive memory usage, and very high Firestore read costs. The client-side pagination only hides the data visually, but all records are still being read from the database.

## Proposed Optimization Changes

### 1. Accounts Directory Optimization (`AccountsTab.jsx`)
- **Strict Limit of 10**: The initial Firestore query will be updated to fetch exactly 10 accounts (`limit(10)`).
- **Server-Side Pagination**: We will implement cursor-based pagination (`startAfter`, `endBefore`) to fetch the next 10 accounts only when the user clicks "Next". 
- **Server-Side Search & Filtering**: Since we will no longer load all accounts, local searching/filtering will break. We will update the search bar and group filters to query Firestore directly (e.g., `where("name", ">=", searchTerm)`) and still apply the limit of 10.
- **Read Reduction**: This will drop account reads on initial load from ~50k down to just 10.

### 2. Transactions Directory Optimization (`TransactionsTab.jsx`)
- **Default to Yesterday**: On initial load, the app will calculate yesterday's date and query Firestore strictly for transactions where `date == yesterday`. 
- **Server-Side Querying**: We will remove the code that fetches the entire `transactions` collection. Instead, clicking "Search" will construct a specific Firestore query based on the selected Date range, Voucher Type, or Account Name.
- **Server-Side Pagination**: We will implement `limit(50)` (or user-defined limit) per page for transactions, fetching more only when needed.
- **Remove "All Accounts" Fetch**: Currently, it fetches all accounts just to populate the datalist for the search dropdown. We will remove this and require the user to type the account name, or we will limit the dropdown to a smaller set (or recent searches) to save reads.

### 3. Open Questions & Firestore Indexes
- **Indexes**: Because we are shifting to server-side querying, Firebase will require **Composite Indexes**. After deploying these changes, searching by combinations (e.g., Date + Account Name) might throw errors in the console with a link to generate the index. You will need to click those links in the console to build the indexes in your Firebase project.
- **Search Limitations**: Firestore does not support full-text substring search natively (e.g., searching "husen" to find "shekh husen" won't work well via direct query without third-party services like Algolia). We will use prefix matching (`>=` and `<=`) meaning you have to type the start of the account name. Is this acceptable?

## User Review Required
Please review the plan. Specifically, note the transition to **server-side searching**, which means exact/prefix matches instead of finding a word anywhere in the name, but it will drastically reduce your loading time from minutes to milliseconds and save huge Firestore costs. If you approve, I will begin implementing these optimizations.
