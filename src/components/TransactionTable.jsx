import React, { useState, useMemo } from 'react';

const formatCurrency = (num) => {
    const formatted = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(num) || 0);
    return `Rs. ${num < 0 ? '-' : ''}${formatted}`;
};

export default function TransactionTable({ transactions, showFullDetails = false, isStatementView = false, selectedAccountName = '' }) {
    const [sortConfig, setSortConfig] = useState(null);

    const sortedTransactions = useMemo(() => {
        if (!sortConfig) return transactions;
        
        const sorted = [...transactions].sort((a, b) => {
            let valA, valB;
            
            if (sortConfig.key === 'date') {
                valA = new Date(a.date).getTime();
                valB = new Date(b.date).getTime();
            } else if (sortConfig.key === 'debitAmount' || sortConfig.key === 'creditAmount') {
                valA = parseFloat(a[sortConfig.key] || 0);
                valB = parseFloat(b[sortConfig.key] || 0);
            } else {
                valA = a[sortConfig.key] ? a[sortConfig.key].toString().toLowerCase() : '';
                valB = b[sortConfig.key] ? b[sortConfig.key].toString().toLowerCase() : '';
            }

            if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [transactions, sortConfig]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key) => {
        if (!sortConfig || sortConfig.key !== key) return ' ↕';
        return sortConfig.direction === 'ascending' ? ' ↑' : ' ↓';
    };

    if (isStatementView) {
        return (
            <div className="overflow-x-auto bg-white">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('date')}>Date{getSortIndicator('date')}</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('type')}>Voucher{getSortIndicator('type')}</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('debitAccount')}>Particulars{getSortIndicator('debitAccount')}</th>
                            <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('debitAmount')}>Debit Amt{getSortIndicator('debitAmount')}</th>
                            <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('creditAmount')}>Credit Amt{getSortIndicator('creditAmount')}</th>
                            <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('runningBalance')}>Balance{getSortIndicator('runningBalance')}</th>
                            {showFullDetails && (
                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('enteredBy')}>Entered By{getSortIndicator('enteredBy')}</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {sortedTransactions.length === 0 ? (
                            <tr><td colSpan={showFullDetails ? "7" : "6"} className="px-4 py-4 text-center text-gray-500">No transactions found.</td></tr>
                        ) : (
                            sortedTransactions.map((t, idx) => {
                                // Check if selected account is in debit side (primary or allDebitAccounts)
                                const isDebit = (t.debitAccount && t.debitAccount.toLowerCase() === selectedAccountName.toLowerCase()) ||
                                    (t.allDebitAccounts && t.allDebitAccounts.some(n => n.toLowerCase() === selectedAccountName.toLowerCase()));
                                const particulars = isDebit ? `To ${t.creditAccount}` : `By ${t.debitAccount}`;

                                // Calculate per-account amount for multi-ledger journals
                                let accountDebitAmt = t.debitAmount;
                                let accountCreditAmt = t.creditAmount;
                                if (isDebit && t.allDebitEntries && t.allDebitEntries.length > 0) {
                                    accountDebitAmt = t.allDebitEntries
                                        .filter(e => e.name && e.name.toLowerCase() === selectedAccountName.toLowerCase())
                                        .reduce((sum, e) => sum + e.amount, 0);
                                } else if (!isDebit && t.allCreditEntries && t.allCreditEntries.length > 0) {
                                    accountCreditAmt = t.allCreditEntries
                                        .filter(e => e.name && e.name.toLowerCase() === selectedAccountName.toLowerCase())
                                        .reduce((sum, e) => sum + e.amount, 0);
                                }

                                return (
                                    <React.Fragment key={t.id || idx}>
                                        <tr className="hover:bg-gray-50">
                                            <td className="px-4 py-3 whitespace-nowrap text-gray-900">{t.date}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                                                <div className="font-medium text-gray-900">{t.type}</div>
                                                <div className="text-xs">No: {t.voucherNo}</div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-gray-900" title={particulars}>{particulars}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-right text-gray-900 font-medium">{isDebit && accountDebitAmt ? formatCurrency(accountDebitAmt) : ''}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-right text-gray-900 font-medium">{!isDebit && accountCreditAmt ? formatCurrency(accountCreditAmt) : ''}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-right text-gray-900 font-bold">{formatCurrency(t.runningBalance)} <span className="text-xs font-normal text-gray-500">{t.runningBalanceType}</span></td>
                                            {showFullDetails && (
                                                <td className="px-4 py-3 whitespace-nowrap text-gray-500">{t.enteredBy}</td>
                                            )}
                                        </tr>
                                        {showFullDetails && (t.inventory?.length > 0 || t.narration || (t.allDebitEntries?.length > 1 || t.allCreditEntries?.length > 1)) && (
                                            <tr className="bg-gray-50/50">
                                                <td colSpan="7" className="px-4 py-2 text-xs text-gray-600 border-t border-dashed border-gray-200">
                                                    {t.narration && <div className="mb-1"><span className="font-semibold text-gray-800">Narration:</span> {t.narration}</div>}
                                                    {(t.allDebitEntries?.length > 1 || t.allCreditEntries?.length > 1) && (
                                                        <div className="mb-1">
                                                            <span className="font-semibold text-gray-800">All Entries: </span>
                                                            <div className="flex gap-6 mt-1">
                                                                {t.allDebitEntries?.length > 0 && (
                                                                    <div>
                                                                        <span className="font-semibold text-green-700">Dr:</span>
                                                                        <ul className="list-disc pl-5 mt-0.5 space-y-0.5">
                                                                            {t.allDebitEntries.map((e, i) => (
                                                                                <li key={i}>{e.name} — {formatCurrency(e.amount)}</li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                                {t.allCreditEntries?.length > 0 && (
                                                                    <div>
                                                                        <span className="font-semibold text-red-700">Cr:</span>
                                                                        <ul className="list-disc pl-5 mt-0.5 space-y-0.5">
                                                                            {t.allCreditEntries.map((e, i) => (
                                                                                <li key={i}>{e.name} — {formatCurrency(e.amount)}</li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {t.inventory?.length > 0 && (
                                                        <div className="mt-1">
                                                            <span className="font-semibold text-gray-800">Inventory: </span>
                                                            <ul className="list-disc pl-5 mt-1 space-y-1">
                                                                {t.inventory.map((inv, i) => (
                                                                    <li key={i}>
                                                                        {inv.itemName} — {inv.qty} @ {inv.rate} (Amt: {formatCurrency(inv.amount)})
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('date')}>Date{getSortIndicator('date')}</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('type')}>Voucher{getSortIndicator('type')}</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('debitAccount')}>Debit Account{getSortIndicator('debitAccount')}</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('debitAmount')}>Debit Amt{getSortIndicator('debitAmount')}</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('creditAccount')}>Credit Account{getSortIndicator('creditAccount')}</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('creditAmount')}>Credit Amt{getSortIndicator('creditAmount')}</th>
                        {showFullDetails && (
                            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('enteredBy')}>Entered By{getSortIndicator('enteredBy')}</th>
                        )}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {sortedTransactions.length === 0 ? (
                        <tr><td colSpan={showFullDetails ? "7" : "6"} className="px-4 py-4 text-center text-gray-500">No transactions found.</td></tr>
                    ) : (
                        sortedTransactions.map((t, idx) => (
                            <React.Fragment key={t.id || idx}>
                                <tr className="hover:bg-gray-50">
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-900">{t.date}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                                        <div className="font-medium text-gray-900">{t.type}</div>
                                        <div className="text-xs">No: {t.voucherNo}</div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-900 max-w-[300px] truncate" title={t.debitAccount}>{t.debitAccount}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right text-gray-900 font-medium">{formatCurrency(t.debitAmount)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-900 max-w-[300px] truncate" title={t.creditAccount}>{t.creditAccount}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right text-gray-900 font-medium">{formatCurrency(t.creditAmount)}</td>
                                    {showFullDetails && (
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">{t.enteredBy}</td>
                                    )}
                                </tr>
                                {showFullDetails && (t.inventory?.length > 0 || t.narration || (t.allDebitEntries?.length > 1 || t.allCreditEntries?.length > 1)) && (
                                    <tr className="bg-gray-50/50">
                                        <td colSpan="7" className="px-4 py-2 text-xs text-gray-600 border-t border-dashed border-gray-200">
                                            {t.narration && <div className="mb-1"><span className="font-semibold text-gray-800">Narration:</span> {t.narration}</div>}
                                            {(t.allDebitEntries?.length > 1 || t.allCreditEntries?.length > 1) && (
                                                <div className="mb-1">
                                                    <span className="font-semibold text-gray-800">All Entries: </span>
                                                    <div className="flex gap-6 mt-1">
                                                        {t.allDebitEntries?.length > 0 && (
                                                            <div>
                                                                <span className="font-semibold text-green-700">Dr:</span>
                                                                <ul className="list-disc pl-5 mt-0.5 space-y-0.5">
                                                                    {t.allDebitEntries.map((e, i) => (
                                                                        <li key={i}>{e.name} — {formatCurrency(e.amount)}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                        {t.allCreditEntries?.length > 0 && (
                                                            <div>
                                                                <span className="font-semibold text-red-700">Cr:</span>
                                                                <ul className="list-disc pl-5 mt-0.5 space-y-0.5">
                                                                    {t.allCreditEntries.map((e, i) => (
                                                                        <li key={i}>{e.name} — {formatCurrency(e.amount)}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            {t.inventory?.length > 0 && (
                                                <div className="mt-1">
                                                    <span className="font-semibold text-gray-800">Inventory: </span>
                                                    <ul className="list-disc pl-5 mt-1 space-y-1">
                                                        {t.inventory.map((inv, i) => (
                                                            <li key={i}>
                                                                {inv.itemName} — {inv.qty} @ {inv.rate} (Amt: {formatCurrency(inv.amount)})
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
