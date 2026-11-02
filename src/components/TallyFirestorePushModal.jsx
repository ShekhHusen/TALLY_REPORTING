import React, { useState, useEffect } from 'react';
import {
    X, UploadCloud, AlertTriangle, CheckCircle2,
    ArrowRightLeft, UserPlus, Layers, BarChart3, Loader2
} from 'lucide-react';
import { analyzePushPreview, executeFirestorePush } from '../utils/tallyFirestorePush';

/**
 * TallyFirestorePushModal — Confirmation & progress modal for pushing
 * Tally-synced vouchers/transactions to Firebase Firestore.
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - transactions: array of Tally-fetched vouchers (from localStorage cache)
 *  - activeFY: { id, name, startDate, endDate }
 *  - currentUser: { name, ... }
 *  - onComplete: () => void — called after successful push for parent refresh
 */
export default function TallyFirestorePushModal({
    isOpen,
    onClose,
    transactions,
    activeFY,
    fyOptions = [],
    selectedFYId = '',
    onSelectFY,
    currentUser,
    onComplete
}) {
    const [phase, setPhase] = useState('analyzing'); // 'analyzing' | 'ready' | 'pushing' | 'done' | 'error'
    const [analysis, setAnalysis] = useState(null);
    const [progressText, setProgressText] = useState('');
    const [result, setResult] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    // Run analysis on open or when activeFY changes
    useEffect(() => {
        if (!isOpen || !transactions || transactions.length === 0 || !activeFY) return;
        let cancelled = false;

        setPhase('analyzing');
        setAnalysis(null);
        setResult(null);
        setErrorMsg('');

        analyzePushPreview(transactions, activeFY)
            .then(data => {
                if (!cancelled) {
                    setAnalysis(data);
                    setPhase(data.validCount > 0 ? 'ready' : 'empty');
                    if (data.validCount === 0) {
                        setErrorMsg(`No transactions fall within ${activeFY.name} (${activeFY.startDate} to ${activeFY.endDate}). ${data.skippedCount > 0 ? `All ${data.skippedCount} transactions are outside this FY range.` : ''}`);
                    }
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setPhase('error');
                    setErrorMsg(err.message);
                }
            });

        return () => { cancelled = true; };
    }, [isOpen, transactions, activeFY]);

    const handlePush = async () => {
        setPhase('pushing');
        setProgressText('Starting push...');
        try {
            const res = await executeFirestorePush({
                transactions,
                activeFY,
                currentUser,
                onProgress: setProgressText,
            });
            setResult(res);
            setPhase('done');
            if (onComplete) onComplete();
        } catch (err) {
            setPhase('error');
            setErrorMsg(err.message);
        }
    };

    if (!isOpen) return null;

    const voucherTypeEntries = analysis ? Object.entries(analysis.voucherTypes).sort((a, b) => b[1] - a[1]) : [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

                {/* ─── Header ─── */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-emerald-100 rounded-xl">
                            <UploadCloud className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div>
                            <h2 className="text-base font-extrabold text-slate-900">Push to Firebase</h2>
                            {fyOptions && fyOptions.length > 1 ? (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[11px] text-slate-500 font-semibold">Target FY:</span>
                                    <select
                                        value={selectedFYId}
                                        onChange={(e) => onSelectFY && onSelectFY(e.target.value)}
                                        disabled={phase === 'pushing'}
                                        className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-slate-800 shadow-2xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    >
                                        {fyOptions.map(f => (
                                            <option key={f.id} value={f.id}>{f.name} ({f.startDate} → {f.endDate})</option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <p className="text-[11px] text-slate-500 font-semibold">
                                    FY: {activeFY?.name || '-'} ({activeFY?.startDate} → {activeFY?.endDate})
                                </p>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={phase === 'pushing'}
                        className="p-2 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
                    >
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* ─── Body ─── */}
                <div className="flex-1 overflow-y-auto p-5">

                    {/* Analyzing Phase */}
                    {phase === 'analyzing' && (
                        <div className="flex flex-col items-center justify-center gap-3 py-10">
                            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                            <p className="text-sm font-bold text-slate-600">Analyzing transactions...</p>
                            <p className="text-xs text-slate-400">Comparing with existing Firestore data</p>
                        </div>
                    )}

                    {/* Ready Phase — Summary */}
                    {phase === 'ready' && analysis && (
                        <div className="flex flex-col gap-4">
                            {/* Transaction Summary */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-blue-50 rounded-xl p-3.5">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                                        <span className="text-[11px] font-extrabold text-blue-700 uppercase tracking-wider">Total Valid</span>
                                    </div>
                                    <p className="text-2xl font-black text-blue-900">{analysis.validCount}</p>
                                    {analysis.skippedCount > 0 && (
                                        <p className="text-[10px] text-blue-500 font-semibold mt-0.5">
                                            +{analysis.skippedCount} outside FY (skipped)
                                        </p>
                                    )}
                                </div>

                                <div className="bg-emerald-50 rounded-xl p-3.5">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Layers className="w-4 h-4 text-emerald-600" />
                                        <span className="text-[11px] font-extrabold text-emerald-700 uppercase tracking-wider">New</span>
                                    </div>
                                    <p className="text-2xl font-black text-emerald-900">{analysis.newTxnCount}</p>
                                    {analysis.existingTxnCount > 0 && (
                                        <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
                                            {analysis.existingTxnCount} already exist (will update)
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Voucher Type Breakdown */}
                            {voucherTypeEntries.length > 0 && (
                                <div className="bg-slate-50 rounded-xl p-3.5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <BarChart3 className="w-4 h-4 text-slate-600" />
                                        <span className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">Voucher Types</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {voucherTypeEntries.map(([type, count]) => (
                                            <span key={type} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700">
                                                {type}
                                                <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-1.5 rounded-full">{count}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* New Accounts Warning */}
                            {analysis.newAccountNames.length > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <UserPlus className="w-4 h-4 text-amber-600" />
                                        <span className="text-[11px] font-extrabold text-amber-700 uppercase tracking-wider">
                                            {analysis.newAccountNames.length} New Accounts (Auto-create)
                                        </span>
                                    </div>
                                    <div className="max-h-24 overflow-y-auto">
                                        <div className="flex flex-wrap gap-1.5">
                                            {analysis.newAccountNames.map(name => (
                                                <span key={name} className="inline-block px-2 py-0.5 bg-amber-100 text-amber-900 text-[11px] font-semibold rounded-lg">
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-amber-600 mt-2 font-medium">
                                        These ledgers are not in Firebase. They will be auto-created with <code className="bg-amber-100 px-1 rounded">isNewAutoCreated: true</code>
                                    </p>
                                </div>
                            )}

                            {/* Dedup Info */}
                            {analysis.existingTxnCount > 0 && (
                                <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-xs font-bold text-sky-800">Smart Dedup Active</p>
                                            <p className="text-[11px] text-sky-600 mt-0.5">
                                                {analysis.existingTxnCount} voucher{analysis.existingTxnCount > 1 ? 's' : ''} already exist in Firebase and will be overwritten.
                                                Balance delta will only apply for the {analysis.newTxnCount} new transaction{analysis.newTxnCount !== 1 ? 's' : ''}.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Pushing Phase */}
                    {phase === 'pushing' && (
                        <div className="flex flex-col items-center justify-center gap-4 py-10">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-full border-4 border-emerald-100 border-t-emerald-600 animate-spin" />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-bold text-slate-800">Pushing to Firebase...</p>
                                <p className="text-xs text-emerald-600 font-semibold mt-1">{progressText}</p>
                            </div>
                            <p className="text-[10px] text-slate-400">Please do not close this window</p>
                        </div>
                    )}

                    {/* Done Phase */}
                    {phase === 'done' && result && (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col items-center gap-2 py-4">
                                <div className="p-3 bg-emerald-100 rounded-full">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                                </div>
                                <p className="text-lg font-extrabold text-emerald-800">Push Successful!</p>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-500">Fiscal Year</span>
                                    <span className="text-slate-800">{result.fyName}</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-500">Total Pushed</span>
                                    <span className="text-slate-800">{result.totalPushed}</span>
                                </div>
                                {result.skippedCount > 0 && (
                                    <div className="flex justify-between text-xs font-bold">
                                        <span className="text-slate-500">Skipped (out of FY range)</span>
                                        <span className="text-amber-600">{result.skippedCount}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-500">New Transactions</span>
                                    <span className="text-emerald-700">{result.newTransactionCount}</span>
                                </div>
                                {result.updatedTransactionCount > 0 && (
                                    <div className="flex justify-between text-xs font-bold">
                                        <span className="text-slate-500">Updated (overwritten)</span>
                                        <span className="text-blue-700">{result.updatedTransactionCount}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-500">Affected Accounts</span>
                                    <span className="text-slate-800">{result.affectedAccountCount}</span>
                                </div>
                                {result.newAccountCount > 0 && (
                                    <div className="flex justify-between text-xs font-bold">
                                        <span className="text-slate-500">New Accounts Created</span>
                                        <span className="text-amber-700">{result.newAccountCount}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-500">Balances Synced</span>
                                    <span className="text-slate-800">{result.syncedAccountCount} accounts</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Empty Phase (0 valid transactions for activeFY) */}
                    {phase === 'empty' && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <div className="p-3 bg-amber-100 rounded-full">
                                <AlertTriangle className="w-8 h-8 text-amber-600" />
                            </div>
                            <p className="text-base font-extrabold text-amber-900">No Matching Vouchers</p>
                            <p className="text-xs text-amber-700 text-center max-w-sm">{errorMsg}</p>
                            {fyOptions && fyOptions.length > 1 && (
                                <p className="text-xs text-slate-500 text-center mt-2">
                                    Try selecting a different Target Fiscal Year from the dropdown above.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Error Phase */}
                    {phase === 'error' && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <div className="p-3 bg-red-100 rounded-full">
                                <AlertTriangle className="w-8 h-8 text-red-600" />
                            </div>
                            <p className="text-base font-extrabold text-red-800">Push Failed</p>
                            <p className="text-sm text-red-600 text-center max-w-sm">{errorMsg}</p>
                        </div>
                    )}
                </div>

                {/* ─── Footer ─── */}
                <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                    {phase === 'ready' && (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handlePush}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-sm hover:shadow transition-all cursor-pointer"
                            >
                                <UploadCloud className="w-4 h-4" />
                                Push {analysis?.validCount || 0} Transactions
                            </button>
                        </>
                    )}
                    {(phase === 'done' || phase === 'error' || phase === 'empty') && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-800 text-white font-bold text-sm rounded-xl shadow-sm transition-all cursor-pointer"
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
