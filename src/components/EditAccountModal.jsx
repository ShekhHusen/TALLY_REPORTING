import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { X } from 'lucide-react';

export default function EditAccountModal({ isOpen, onClose, account, fyOptions, selectedFY, onSave, groupOptions = [] }) {
  const [currentFY, setCurrentFY] = useState(selectedFY);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);
  
  const [openingBalance, setOpeningBalance] = useState(0);
  const [openingBalanceType, setOpeningBalanceType] = useState('Dr');
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState('');

  useEffect(() => {
    if (isOpen && account) {
      setCurrentFY(selectedFY);
      setSelectedGroup(account.group || '');
      fetchAccountData(selectedFY);
    }
  }, [isOpen, account, selectedFY]);

  async function fetchAccountData(fyId) {
    if (!account || !account.allDocIds || account.allDocIds.length === 0) return;
    
    setFetching(true);
    setError(null);
    try {
      let foundData = null;
      for (const docId of account.allDocIds) {
        const fyDocRef = doc(db, 'accounts', docId, 'fiscalYears', fyId);
        const fyDocSnap = await getDoc(fyDocRef);
        
        if (fyDocSnap.exists()) {
          foundData = fyDocSnap.data();
          break; // Stop after finding the first one
        }
      }
      
      if (foundData) {
        setOpeningBalance(foundData.openingBalance || 0);
        setOpeningBalanceType(foundData.openingBalanceType || 'Dr');
        setTotalDebit(foundData.totalDebit || 0);
        setTotalCredit(foundData.totalCredit || 0);
      } else {
        // Reset if no data found
        setOpeningBalance(0);
        setOpeningBalanceType('Dr');
        setTotalDebit(0);
        setTotalCredit(0);
      }
    } catch (err) {
      console.error("Error fetching account data:", err);
      setError("Failed to fetch account data");
    } finally {
      setFetching(false);
    }
  };

  const handleFYChange = (e) => {
    const newFY = e.target.value;
    setCurrentFY(newFY);
    fetchAccountData(newFY);
  };

  const getCalculatedClosing = () => {
    const ob = Number(openingBalance) || 0;
    const openingVal = openingBalanceType === 'Cr' ? -Math.abs(ob) : Math.abs(ob);
    const td = Number(totalDebit) || 0;
    const tc = Number(totalCredit) || 0;
    const newClosingVal = openingVal + td - tc;
    
    return {
      balance: Math.abs(newClosingVal),
      type: newClosingVal >= 0 ? 'Dr' : 'Cr'
    };
  };

  const handleSave = async () => {
    if (!account || !account.allDocIds || account.allDocIds.length === 0) return;
    
    setLoading(true);
    setError(null);
    try {
      const ob = Number(openingBalance) || 0;
      const openingVal = openingBalanceType === 'Cr' ? -Math.abs(ob) : Math.abs(ob);
      const td = Number(totalDebit) || 0;
      const tc = Number(totalCredit) || 0;
      const newClosingVal = openingVal + td - tc;
      
      const newClosingBalance = Math.abs(newClosingVal);
      const newClosingBalanceType = newClosingVal >= 0 ? 'Dr' : 'Cr';

      const updateData = {
        openingBalance: Math.abs(ob),
        openingBalanceType,
        closingBalance: newClosingBalance,
        closingBalanceType: newClosingBalanceType,
        verifiedBy: null,
        verifiedAt: null
      };

      const promises = [];

      // Update fiscal year sub-documents
      for (const docId of account.allDocIds) {
        const fyDocRef = doc(db, 'accounts', docId, 'fiscalYears', currentFY);
        promises.push(setDoc(fyDocRef, updateData, { merge: true }));
      }

      // Update group on root account documents if changed
      if (selectedGroup !== (account.group || '')) {
        for (const docId of account.allDocIds) {
          const accDocRef = doc(db, 'accounts', docId);
          promises.push(setDoc(accDocRef, { group: selectedGroup }, { merge: true }));
        }
      }

      await Promise.all(promises);
      
      alert("Account updated successfully");
      if (onSave) onSave({ ...updateData, fyId: currentFY, group: selectedGroup });
      onClose();
    } catch (err) {
      console.error("Error saving account data:", err);
      setError("Failed to save changes");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const closingPreview = getCalculatedClosing();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
            <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Edit Account</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 text-sm rounded-lg border border-red-100 font-medium">
              {error}
            </div>
          )}

          {fetching ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Account Name</label>
                  <div className="text-sm text-gray-800 bg-gray-50 p-2.5 rounded-lg border border-gray-100 truncate font-medium">
                    {account?.name || 'Unknown'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">GUID</label>
                  <div className="text-sm text-gray-500 bg-gray-50 p-2.5 rounded-lg border border-gray-100 truncate font-medium">
                    {account?.guid || 'N/A'}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Account Group</label>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-800 transition-colors cursor-pointer"
                >
                  <option value="">-- No Group --</option>
                  {groupOptions.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                {selectedGroup !== (account?.group || '') && (
                  <p className="text-xs font-medium text-amber-600 mt-2 bg-amber-50 p-2 rounded border border-amber-100">
                    Group will be changed from "<b>{account?.group || 'None'}</b>" to "<b>{selectedGroup || 'None'}</b>"
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Fiscal Year</label>
                <select
                  value={currentFY}
                  onChange={handleFYChange}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-800 transition-colors cursor-pointer"
                >
                  {fyOptions?.map(fy => (
                    <option key={fy.id} value={fy.id}>{fy.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Opening Balance</label>
                  <input
                    type="number"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-800 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Type</label>
                  <div className="flex rounded-lg shadow-sm">
                    <button
                      type="button"
                      onClick={() => setOpeningBalanceType('Dr')}
                      className={`flex-1 px-4 py-2.5 text-sm font-bold border rounded-l-lg focus:outline-none transition-colors ${
                        openingBalanceType === 'Dr' 
                           ? 'bg-blue-50 text-blue-700 border-blue-200 relative z-10' 
                           : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      Dr
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpeningBalanceType('Cr')}
                      className={`flex-1 px-4 py-2.5 text-sm font-bold border rounded-r-lg -ml-px focus:outline-none transition-colors ${
                        openingBalanceType === 'Cr' 
                           ? 'bg-amber-50 text-amber-700 border-amber-200 relative z-10' 
                           : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      Cr
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl mt-2 flex flex-col gap-3">
                <div className="flex justify-between items-center pb-2 border-b border-gray-200 border-dashed">
                  <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Transaction Totals</span>
                  <span className="font-mono text-xs font-bold text-gray-600">
                    <span className="text-blue-600">Dr {Number(totalDebit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    <span className="mx-2 text-gray-300">|</span>
                    <span className="text-amber-600">Cr {Number(totalCredit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">New Closing Balance</span>
                  <span className={`text-lg font-mono font-black ${closingPreview.type === 'Cr' ? 'text-amber-600' : 'text-blue-700'}`}>
                    {closingPreview.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })} <span className="text-sm font-bold opacity-80">{closingPreview.type}</span>
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 bg-white flex justify-end gap-3 sticky bottom-0 z-10 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 rounded-lg text-sm font-bold transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || fetching}
            className="px-5 py-2.5 rounded-lg text-sm font-bold transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center shadow-sm"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
