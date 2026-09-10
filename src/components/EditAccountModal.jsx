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

  const fetchAccountData = async (fyId) => {
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
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-medium text-gray-900">Edit Account</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500 transition">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-2 text-sm rounded border border-red-200">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                  <div className="text-sm text-gray-500 bg-gray-50 p-2 rounded border border-gray-200 truncate">
                    {account?.name || 'Unknown'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GUID</label>
                  <div className="text-sm text-gray-500 bg-gray-50 p-2 rounded border border-gray-200 truncate">
                    {account?.guid || 'N/A'}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Group</label>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                >
                  <option value="">-- No Group --</option>
                  {groupOptions.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                {selectedGroup !== (account?.group || '') && (
                  <p className="text-xs text-amber-600 mt-1">
                    Group will be changed from "<b>{account?.group || 'None'}</b>" to "<b>{selectedGroup || 'None'}</b>"
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year</label>
                <select
                  value={currentFY}
                  onChange={handleFYChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                >
                  {fyOptions?.map(fy => (
                    <option key={fy.id} value={fy.id}>{fy.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Opening Balance</label>
                  <input
                    type="number"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <div className="flex rounded shadow-sm">
                    <button
                      type="button"
                      onClick={() => setOpeningBalanceType('Dr')}
                      className={`flex-1 px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-l focus:outline-none ${
                        openingBalanceType === 'Dr' 
                          ? 'bg-blue-50 text-blue-700 border-blue-500 relative z-10' 
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Dr
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpeningBalanceType('Cr')}
                      className={`flex-1 px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-r -ml-px focus:outline-none ${
                        openingBalanceType === 'Cr' 
                          ? 'bg-blue-50 text-blue-700 border-blue-500 relative z-10' 
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Cr
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg mt-2">
                <h3 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-2">Closing Balance Preview</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-600">Transactions:</div>
                  <div className="text-right font-mono text-gray-800">
                    Dr {Number(totalDebit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Cr {Number(totalCredit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-gray-600 font-medium">New Closing:</div>
                  <div className={`text-right font-mono font-medium ${closingPreview.type === 'Cr' ? 'text-red-600' : 'text-green-600'}`}>
                    {closingPreview.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })} {closingPreview.type}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2 sticky bottom-0 z-10">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 rounded text-sm font-medium transition bg-gray-200 hover:bg-gray-300 text-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || fetching}
            className="px-3 py-1.5 rounded text-sm font-medium transition bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center"
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
