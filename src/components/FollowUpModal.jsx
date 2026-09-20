import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  X, Calendar, User, MessageSquare, Clock, CheckCircle, 
  AlertCircle, PhoneCall, History 
} from 'lucide-react';
import UpdateFollowUpModal from './UpdateFollowUpModal';

export default function FollowUpModal({ isOpen, onClose, account, currentUser }) {
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'secondary_admin' || currentUser?.adminType === 'secondary';
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Users list for admin
  const [users, setUsers] = useState([]);

  // Sub-modal for rescheduling / viewing history
  const [selectedFollowUp, setSelectedFollowUp] = useState(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateModalTab, setUpdateModalTab] = useState('update');
  
  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [message, setMessage] = useState('');
  const [completed, setCompleted] = useState(false);
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [assignedToUid, setAssignedToUid] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && account) {
      fetchFollowUps();
      fetchUsers();
    } else {
      // Reset state when closed
      setShowAddForm(false);
      resetForm();
    }
  }, [isOpen, account, currentUser]);

  async function fetchFollowUps() {
    if (!account) return;
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'followUps'));
      const accNameLower = (account.name || '').trim().toLowerCase();
      const accountIds = account.allDocIds || (account.id ? [account.id] : []);

      const data = [];
      snapshot.forEach(d => {
        const item = d.data();
        const itemAccName = (item.accountName || '').trim().toLowerCase();
        const matchesName = itemAccName === accNameLower;
        const matchesId = item.accountId && accountIds.includes(item.accountId);
        if (matchesName || matchesId) {
          data.push({ id: d.id, ...item });
        }
      });

      // Sort client-side descending by createdAt or date
      data.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.date ? new Date(a.date).getTime() : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.date ? new Date(b.date).getTime() : 0);
        return timeB - timeA;
      });

      setFollowUps(data);
    } catch (error) {
      console.error("Error fetching follow-ups:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers() {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const usersData = snapshot.docs.map(doc => ({
        uid: doc.id,
        name: doc.data().name || doc.data().email
      }));
      usersData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setUsers(usersData);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  }

  function resetForm() {
    setDate(new Date().toISOString().split('T')[0]);
    setMessage('');
    setCompleted(false);
    setNextFollowUpDate('');
    setAssignedToUid('');
  }

  const handleOpenUpdate = (fu, tab = 'update') => {
    setSelectedFollowUp(fu);
    setUpdateModalTab(tab);
    setIsUpdateModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSubmitting(true);
    try {
      let assignedToName = currentUser?.name || '';
      let targetAssignedToUid = assignedToUid;
      if (isAdmin && assignedToUid) {
        const selectedUser = users.find(u => u.uid === assignedToUid);
        if (selectedUser) {
          assignedToName = selectedUser.name;
        }
      } else {
        targetAssignedToUid = currentUser?.uid || '';
        assignedToName = currentUser?.name || '';
      }

      // First step in the audit history
      const initialHistoryItem = {
        id: 'hist_' + Date.now(),
        type: 'created',
        action: 'Created Follow-up',
        date,
        timestamp: new Date().toISOString(),
        userName: currentUser?.name || 'Unknown',
        userUid: currentUser?.uid || '',
        note: message.trim(),
        nextFollowUpDate: completed ? null : (nextFollowUpDate || null),
        assignedTo: completed ? null : assignedToName,
        assignedToUid: completed ? null : targetAssignedToUid
      };

      const followUpData = {
        accountName: account.name,
        accountId: account.id || '',
        date,
        userName: currentUser?.name || '',
        createdByUid: currentUser?.uid || '',
        message: message.trim(),
        completed,
        createdAt: serverTimestamp(),
        history: [initialHistoryItem]
      };

      if (!completed) {
        followUpData.nextFollowUpDate = nextFollowUpDate || null;
        followUpData.assignedTo = assignedToName;
        followUpData.assignedToUid = targetAssignedToUid;
      }

      await addDoc(collection(db, 'followUps'), followUpData);
      
      resetForm();
      setShowAddForm(false);
      await fetchFollowUps();
    } catch (error) {
      console.error("Error adding follow-up:", error);
      alert("Failed to save follow-up: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusInfo = (f) => {
    if (f.completed) {
      return { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-200', stripe: 'bg-green-500', icon: <CheckCircle className="w-4 h-4 mr-1 text-green-600" /> };
    }
    
    if (!f.nextFollowUpDate) {
      return { label: 'Pending', color: 'bg-blue-100 text-blue-800 border-blue-200', stripe: 'bg-blue-500', icon: <Clock className="w-4 h-4 mr-1 text-blue-600" /> };
    }

    const today = new Date().toISOString().split('T')[0];
    if (f.nextFollowUpDate === today) {
      return { label: 'Due Today', color: 'bg-amber-100 text-amber-900 border-amber-300', stripe: 'bg-amber-500', icon: <Clock className="w-4 h-4 mr-1 text-amber-600" /> };
    } else if (f.nextFollowUpDate > today) {
      return { label: 'Upcoming', color: 'bg-blue-100 text-blue-800 border-blue-200', stripe: 'bg-blue-500', icon: <Calendar className="w-4 h-4 mr-1 text-blue-600" /> };
    } else {
      return { label: 'Overdue', color: 'bg-red-100 text-red-800 border-red-200', stripe: 'bg-red-500', icon: <AlertCircle className="w-4 h-4 mr-1 text-red-600" /> };
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-extrabold text-gray-900 tracking-tight truncate">
              Follow-ups
            </h2>
            <p className="text-[13px] font-bold text-blue-600 mt-1 truncate max-w-sm uppercase tracking-wide">
              {account?.name}
            </p>
            <p className="text-[10px] font-extrabold text-gray-400 mt-1 uppercase tracking-wider">
              History & active follow-ups for this account
            </p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body - Scrollable list of follow-ups */}
        <div className="flex-1 overflow-y-auto p-5 bg-gray-50/50">
          {loading ? (
            <div className="text-center py-8 text-gray-500 font-medium">Loading follow-ups...</div>
          ) : followUps.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <MessageSquare className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="font-bold text-gray-700">No follow-ups found for this account.</p>
              <p className="text-sm text-gray-400 mt-1">Click below to add the first follow-up.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {followUps.map(f => {
                const status = getStatusInfo(f);
                const historyCount = Array.isArray(f.history) && f.history.length > 0 ? f.history.length : 1;
                return (
                  <div key={f.id} className="bg-white border border-gray-100 rounded-xl shadow-sm relative overflow-hidden transition-all hover:shadow-md">
                    {/* Color stripe on the left */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${status.stripe}`}></div>
                    
                    <div className="p-4 pl-5">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center space-x-2.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${status.color}`}>
                            {status.icon}
                            {status.label}
                          </span>
                          <span className="text-xs font-semibold text-gray-500 flex items-center">
                            <Calendar className="w-3.5 h-3.5 mr-1 text-gray-400" />
                            {f.date}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-gray-500 flex items-center bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                          <User className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                          {f.userName}
                        </div>
                      </div>
                      
                      <div className="text-gray-800 text-sm font-medium leading-relaxed whitespace-pre-wrap">
                        {f.message}
                      </div>

                      {/* Latest Call Info if present */}
                      {f.lastCallNote && (
                        <div className="mt-3 text-xs text-blue-900 bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 flex items-start gap-2">
                          <PhoneCall className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold text-blue-800">Latest Call:</span> <span className="font-medium text-gray-700">{f.lastCallNote}</span>{' '}
                            <span className="text-blue-600 font-bold block mt-0.5">({f.lastCallBy || 'User'} on {f.lastCallDate})</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Card Footer: Next Date, Assigned, and Action buttons */}
                      <div className={`mt-4 pt-3 border-t border-gray-100 flex ${f.completed ? 'flex-col' : 'flex-wrap items-center justify-between'} gap-3 text-xs text-gray-600`}>
                        {!f.completed && (
                          <div className="flex items-center gap-4">
                            {f.nextFollowUpDate && (
                              <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Next Follow-up</span>
                                <b className="text-blue-700 text-xs mt-0.5">{f.nextFollowUpDate}</b>
                              </div>
                            )}
                            {f.assignedTo && (
                              <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Assigned To</span>
                                <span className="font-bold text-gray-700 text-xs mt-0.5">{f.assignedTo}</span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className={`flex items-center gap-2 ${f.completed ? 'w-full' : ''}`}>
                          {!f.completed && (
                            <button
                              type="button"
                              onClick={() => handleOpenUpdate(f)}
                              className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg font-bold transition-colors inline-flex items-center gap-1.5"
                            >
                              <PhoneCall className="w-3.5 h-3.5" /> Reschedule
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenUpdate(f, 'history')}
                            className={`px-3 py-1.5 bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-lg font-bold transition-colors inline-flex items-center justify-center gap-1.5 ${f.completed ? 'w-full py-2.5' : ''}`}
                          >
                            <History className="w-3.5 h-3.5" /> History ({historyCount})
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer / Add New Form */}
        <div className="border-t border-gray-100 bg-white p-5 sticky bottom-0 z-10">
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full bg-blue-600 text-white hover:bg-blue-700 py-3 rounded-xl font-bold transition-colors flex items-center justify-center shadow-sm"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Add New Follow-up
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h3 className="font-extrabold text-gray-900 border-b border-gray-100 pb-2.5 text-sm uppercase tracking-wider">New Follow-up</h3>
              
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Message / Discussion</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={3}
                  placeholder="Enter initial follow-up details..."
                  className="w-full px-4 py-2.5 border border-gray-200 bg-gray-50 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-colors"
                />
              </div>

              <div className="hidden sm:flex items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                <input
                  type="checkbox"
                  id="completed"
                  checked={completed}
                  onChange={(e) => setCompleted(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                />
                <label htmlFor="completed" className="ml-2 block text-xs font-bold text-gray-800 cursor-pointer">
                  Mark as Completed (No further follow-up needed)
                </label>
              </div>

              {!completed && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Next Follow-up Date</label>
                    <input
                      type="date"
                      value={nextFollowUpDate}
                      onChange={(e) => setNextFollowUpDate(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-200 bg-gray-50 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-colors"
                    />
                  </div>
                  
                  {isAdmin && (

                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Assign To</label>
                      <select
                        value={assignedToUid}
                        onChange={(e) => setAssignedToUid(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 bg-gray-50 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-colors"
                      >
                        <option value="">-- Current User ({currentUser?.name}) --</option>
                        {users.map(u => (
                          <option key={u.uid} value={u.uid}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between sm:justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-sm font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                  disabled={isSubmitting}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Update / History Sub-modal */}
      <UpdateFollowUpModal
        isOpen={isUpdateModalOpen}
        initialTab={updateModalTab}
        onClose={() => { setIsUpdateModalOpen(false); setSelectedFollowUp(null); }}
        followUp={selectedFollowUp}
        currentUser={currentUser}
        users={users}
        onSuccess={fetchFollowUps}
      />
    </div>
  );
}
