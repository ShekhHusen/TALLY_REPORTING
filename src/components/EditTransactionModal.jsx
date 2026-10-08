import React, { useState, useEffect } from 'react';
import AccountSearchDropdown from './AccountSearchDropdown';
import { updateTransactionRecord } from '../utils/transactionOperations';
import { X, Plus, Trash2 } from 'lucide-react';

export default function EditTransactionModal({ isOpen, onClose, transaction, currentUser, onSaveSuccess }) {
  const [formDate, setFormDate] = useState('');
  const [voucherType, setVoucherType] = useState('Journal');
  const [voucherNo, setVoucherNo] = useState('');
  const [narration, setNarration] = useState('');
  
  const defaultEntry = { debitAccount: '', creditAccount: '', amount: '' };
  const [entries, setEntries] = useState([{ ...defaultEntry }]);
  
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const voucherTypes = ['Journal', 'Sales', 'Purchase', 'Receipt', 'Payment', 'Contra', 'Credit Note', 'Debit Note'];

  // Initialize form when transaction or isOpen changes
  useEffect(() => {
    if (isOpen && transaction) {
      setFormDate(transaction.date || new Date().toISOString().split('T')[0]);
      setVoucherType(transaction.type || 'Journal');
      setVoucherNo(transaction.voucherNo || '');
      setNarration(transaction.narration || '');
      setError('');
      setIsSaving(false);

      // Extract entry rows
      const debitEntries = transaction.allDebitEntries && transaction.allDebitEntries.length > 0
        ? transaction.allDebitEntries
        : (transaction.debitAccount ? [{ name: transaction.debitAccount, amount: transaction.debitAmount || 0 }] : []);

      const creditEntries = transaction.allCreditEntries && transaction.allCreditEntries.length > 0
        ? transaction.allCreditEntries
        : (transaction.creditAccount ? [{ name: transaction.creditAccount, amount: transaction.creditAmount || 0 }] : []);

      if (debitEntries.length === 0 && creditEntries.length === 0) {
        setEntries([{ ...defaultEntry }]);
      } else {
        const count = Math.max(debitEntries.length, creditEntries.length, 1);
        const initialEntries = [];
        for (let i = 0; i < count; i++) {
          const deb = debitEntries[i] || debitEntries[0] || {};
          const cred = creditEntries[i] || creditEntries[0] || {};
          const amt = deb.amount !== undefined ? deb.amount : (cred.amount !== undefined ? cred.amount : 0);
          initialEntries.push({
            debitAccount: deb.name || '',
            creditAccount: cred.name || '',
            amount: amt ? String(amt) : ''
          });
        }
        setEntries(initialEntries);
      }
    }
  }, [isOpen, transaction]);

  if (!isOpen || !transaction) return null;

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
    try {
      const newDebitEntries = entries.map(e => ({
        name: (e.debitAccount || '').trim(),
        amount: parseFloat(e.amount || 0)
      }));
      const newCreditEntries = entries.map(e => ({
        name: (e.creditAccount || '').trim(),
        amount: parseFloat(e.amount || 0)
      }));

      const newTxnData = {
        date: formDate,
        type: voucherType,
        voucherNo: voucherNo.trim(),
        narration: narration.trim(),
        debitAccount: newDebitEntries[0]?.name || '',
        creditAccount: newCreditEntries[0]?.name || '',
        debitAmount: totalAmount,
        creditAmount: totalAmount,
        allDebitEntries: newDebitEntries,
        allCreditEntries: newCreditEntries
      };

      const success = await updateTransactionRecord(transaction, newTxnData, currentUser);
      if (success) {
        if (onSaveSuccess) onSaveSuccess();
        onClose();
      }
    } catch (err) {
      console.error("Error saving transaction edit:", err);
      setError("Failed to update transaction: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-black tracking-tight">Edit Transaction</h2>
            <p className="text-xs text-slate-400">Update voucher details, accounts, and amounts</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-grow">
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium">{error}</div>}

          {/* Form Header */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Date *</label>
              <input 
                type="date" 
                value={formDate} 
                onChange={e => setFormDate(e.target.value)} 
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium" 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Voucher Type</label>
              <select 
                value={voucherType} 
                onChange={e => setVoucherType(e.target.value)} 
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium bg-white"
              >
                {voucherTypes.map(vt => (
                  <option key={vt} value={vt}>{vt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Voucher No.</label>
              <input 
                type="text" 
                value={voucherNo} 
                onChange={e => setVoucherNo(e.target.value)} 
                placeholder="Voucher No." 
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium" 
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Narration</label>
            <textarea 
              value={narration} 
              onChange={e => setNarration(e.target.value)} 
              rows="2" 
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium" 
              placeholder="Optional narration..."
            />
          </div>

          {/* Entries */}
          <div className="flex justify-between items-center mb-3 border-b border-gray-100 pb-2">
            <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider">Account Entries</h3>
            <span className="text-xs text-gray-400 font-medium">Rows: {entries.length}</span>
          </div>
          
          <div className="space-y-3">
            {entries.map((entry, index) => (
              <div key={index} className="border border-gray-200 rounded-xl p-4 bg-gray-50/70 relative">
                <div className="flex justify-between items-center mb-2">
                  <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full">Entry #{index + 1}</span>
                  {entries.length > 1 && (
                    <button 
                      type="button"
                      onClick={() => removeEntry(index)} 
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" 
                      title="Remove row"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Debit Account (Dr) *</label>
                    <AccountSearchDropdown 
                      value={entry.debitAccount} 
                      onChange={(val) => updateEntry(index, 'debitAccount', val)} 
                      placeholder="Select Debit Account" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Credit Account (Cr) *</label>
                    <AccountSearchDropdown 
                      value={entry.creditAccount} 
                      onChange={(val) => updateEntry(index, 'creditAccount', val)} 
                      placeholder="Select Credit Account" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (Rs.) *</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      value={entry.amount} 
                      onChange={e => updateEntry(index, 'amount', e.target.value)} 
                      placeholder="0.00" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-gray-900 bg-white" 
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button 
            type="button"
            onClick={addEntry} 
            className="mt-3 w-full border-2 border-dashed border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition text-sm bg-white"
          >
            <Plus size={16} />
            <span>Add Entry Row</span>
          </button>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 shrink-0 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex gap-4 text-sm font-semibold">
            <div className="text-gray-600">Total: <span className="text-gray-900 font-black ml-1 text-base">Rs. {totalAmount.toFixed(2)}</span></div>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button 
              type="button"
              onClick={onClose} 
              disabled={isSaving} 
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-sm font-bold transition disabled:opacity-50 flex-1 sm:flex-none"
            >
              Cancel
            </button>
            <button 
              type="button"
              onClick={handleSave} 
              disabled={isSaving} 
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition disabled:opacity-50 flex-1 sm:flex-none shadow-md shadow-blue-200"
            >
              {isSaving ? 'Updating...' : 'Update Transaction'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
