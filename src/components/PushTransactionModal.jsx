import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, setDoc, addDoc, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';
import AccountSearchDropdown from './AccountSearchDropdown';

export default function PushTransactionModal({ isOpen, onClose, currentUser, onSave }) {
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [voucherType, setVoucherType] = useState('Journal');
  const [voucherNo, setVoucherNo] = useState('');
  const [narration, setNarration] = useState('');
  
  const defaultEntry = { debitAccount: '', creditAccount: '', amount: '' };
  const [entries, setEntries] = useState([{ ...defaultEntry }]);
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [error, setError] = useState('');

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setFormDate(new Date().toISOString().split('T')[0]);
      setVoucherType('Journal');
      setVoucherNo('');
      setNarration('');
      setEntries([{ ...defaultEntry }]);
      setIsSaving(false);
      setSaveStatus('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const updateEntry = (index, field, value) => {
    const newEntries = [...entries];
    newEntries[index][field] = value;
    setEntries(newEntries);
  };

  const addEntry = () => {
    setEntries([...entries, { ...defaultEntry }]);
  };

  const removeEntry = (index) => {
    if (entries.length > 1) {
      const newEntries = entries.filter((_, i) => i !== index);
      setEntries(newEntries);
    }
  };

  const totalAmount = entries.reduce((sum, entry) => sum + (parseFloat(entry.amount) || 0), 0);

  const handleSave = async () => {
    setError('');
    
    // Validation
    if (!formDate) return setError('Date is required');
    if (entries.length === 0) return setError('At least 1 entry is required');
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.debitAccount) return setError(`Row ${i + 1}: Debit Account is required`);
      if (!entry.creditAccount) return setError(`Row ${i + 1}: Credit Account is required`);
      if (entry.debitAccount.toLowerCase() === entry.creditAccount.toLowerCase()) {
        return setError(`Row ${i + 1}: Debit and Credit accounts cannot be the same`);
      }
      if (!entry.amount || parseFloat(entry.amount) <= 0) {
        return setError(`Row ${i + 1}: Amount must be greater than 0`);
      }
    }

    setIsSaving(true);
    setSaveStatus('Saving transactions...');

    try {
      // 1. Save all entries to transactions collection
      for (const entry of entries) {
        await addDoc(collection(db, 'transactions'), {
          date: formDate,
          type: voucherType,
          voucherNo: voucherNo,
          debitAccount: entry.debitAccount,
          creditAccount: entry.creditAccount,
          debitAmount: parseFloat(entry.amount),
          creditAmount: parseFloat(entry.amount),
          narration: narration,
          enteredBy: currentUser?.name || 'Unknown',
          isManual: true,
          unverified: true,
          createdAt: serverTimestamp()
        });
      }

      setSaveStatus('Updating balances...');

      // 2. Recalculate balances for affected accounts
      const affectedAccounts = new Set();
      entries.forEach(entry => {
        affectedAccounts.add(entry.debitAccount);
        affectedAccounts.add(entry.creditAccount);
      });

      // Get FY for the transaction date
      const allFys = await fetchFiscalYears();
      let currentFY = allFys.find(fy => formDate >= fy.startDate && formDate <= fy.endDate);
      if (!currentFY) {
        currentFY = getCurrentFYObject(allFys);
      }

      if (currentFY) {
        // Fetch accounts to get all doc IDs case-insensitively
        const snap = await getDocs(collection(db, 'accounts'));
        const accountDocMap = new Map();
        snap.forEach(d => {
          const name = d.data()?.name ? d.data().name.trim() : '';
          if (name) {
            const key = name.toLowerCase();
            if (!accountDocMap.has(key)) {
              accountDocMap.set(key, [d.id]);
            } else {
              accountDocMap.get(key).push(d.id);
            }
          }
        });

        for (const accountName of affectedAccounts) {
          const key = (accountName || '').trim().toLowerCase();
          const docIds = accountDocMap.get(key) || [];
          
          if (docIds.length > 0) {
            // Read current FY data from the first document that has it
            let fyData = {};
            for (const docId of docIds) {
              const fyDocRef = doc(db, 'accounts', docId, 'fiscalYears', currentFY.id);
              const fyDoc = await getDoc(fyDocRef);
              if (fyDoc.exists()) {
                fyData = fyDoc.data();
                break;
              }
            }

            // Calculate totals
            let addedDebit = 0;
            let addedCredit = 0;
            
            entries.forEach(entry => {
              if (entry.debitAccount && entry.debitAccount.trim().toLowerCase() === key) {
                addedDebit += parseFloat(entry.amount) || 0;
              }
              if (entry.creditAccount && entry.creditAccount.trim().toLowerCase() === key) {
                addedCredit += parseFloat(entry.amount) || 0;
              }
            });

            const newTotalDebit = (fyData.totalDebit || 0) + addedDebit;
            const newTotalCredit = (fyData.totalCredit || 0) + addedCredit;
            
            const openingBalanceType = fyData.openingBalanceType || 'Dr';
            const openingVal = (openingBalanceType === 'Cr' ? -1 : 1) * parseFloat(fyData.openingBalance || 0);
            const newClosingVal = openingVal + newTotalDebit - newTotalCredit;

            const newClosingBalanceType = newClosingVal < 0 ? 'Cr' : 'Dr';
            const newClosingBalance = Math.abs(newClosingVal);

            const updatePayload = {
              totalDebit: newTotalDebit,
              totalCredit: newTotalCredit,
              closingBalance: newClosingBalance,
              closingBalanceType: newClosingBalanceType,
              verifiedBy: null,
              verifiedAt: null
            };

            // Update all docIds for this account
            const updatePromises = docIds.map(docId => {
              const fyDocRef = doc(db, 'accounts', docId, 'fiscalYears', currentFY.id);
              return setDoc(fyDocRef, updatePayload, { merge: true });
            });
            await Promise.all(updatePromises);
          }
        }
      }

      alert('Transactions saved successfully!');
      if (onSave) onSave();
      onClose();
    } catch (err) {
      console.error('Error saving transactions:', err);
      setError('Failed to save transactions: ' + err.message);
    } finally {
      setIsSaving(false);
      setSaveStatus('');
    }
  };

  const voucherTypes = ['Journal', 'Sales', 'Purchase', 'Receipt', 'Payment', 'Contra', 'Credit Note', 'Debit Note'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-indigo-600 text-white px-6 py-4 rounded-t-lg flex justify-between items-center shrink-0">
          <h2 className="text-xl font-semibold">Push Transaction - Journal Entry</h2>
          <button onClick={onClose} className="text-white hover:text-indigo-200 transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-grow">
          {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}

          {/* Form Header */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Type</label>
              <select value={voucherType} onChange={e => setVoucherType(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm">
                {voucherTypes.map(vt => (
                  <option key={vt} value={vt}>{vt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Voucher No.</label>
              <input type="text" value={voucherNo} onChange={e => setVoucherNo(e.target.value)} placeholder="Auto or type manual no." className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Narration</label>
              <textarea value={narration} onChange={e => setNarration(e.target.value)} rows="2" className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm" placeholder="Optional narration..."></textarea>
            </div>
          </div>

          <h3 className="text-lg font-medium text-gray-800 mb-3 border-b pb-2">Entries</h3>
          
          <div className="space-y-4">
            {entries.map((entry, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50 relative">
                <div className="absolute top-2 left-2 bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded">#{index + 1}</div>
                {entries.length > 1 && (
                  <button onClick={() => removeEntry(index)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 transition" title="Remove entry">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Debit A/c *</label>
                    <AccountSearchDropdown value={entry.debitAccount} onChange={(val) => updateEntry(index, 'debitAccount', val)} placeholder="Select Debit A/C" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Credit A/c *</label>
                    <AccountSearchDropdown value={entry.creditAccount} onChange={(val) => updateEntry(index, 'creditAccount', val)} placeholder="Select Credit A/C" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                    <input type="number" step="0.01" value={entry.amount} onChange={e => updateEntry(index, 'amount', e.target.value)} placeholder="0.00" className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={addEntry} type="button" className="mt-4 w-full border-2 border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800 font-medium py-3 rounded-lg flex items-center justify-center transition">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            Add Entry
          </button>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t px-6 py-4 rounded-b-lg shrink-0 flex flex-col sm:flex-row justify-between items-center">
          <div className="flex gap-6 mb-4 sm:mb-0 text-sm font-medium">
            <div className="text-gray-700">Total Debit: <span className="text-gray-900 font-bold ml-1">{totalAmount.toFixed(2)}</span></div>
            <div className="text-gray-700">Total Credit: <span className="text-gray-900 font-bold ml-1">{totalAmount.toFixed(2)}</span></div>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {isSaving && <span className="text-sm text-indigo-600 font-medium mr-2">{saveStatus}</span>}
            <button onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm font-medium transition disabled:opacity-50 flex-1 sm:flex-none">
              Cancel
            </button>
            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition disabled:opacity-50 flex-1 sm:flex-none whitespace-nowrap">
              {isSaving ? 'Saving...' : 'Save All Entries'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
