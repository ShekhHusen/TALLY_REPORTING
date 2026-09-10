import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  X, Calendar, User, MessageSquare, Clock, CheckCircle, 
  AlertCircle, PhoneCall, History 
} from 'lucide-react';
import UpdateFollowUpModal from './UpdateFollowUpModal';

export default function FollowUpModal({ isOpen, onClose, account, currentUser }) {
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Users list for admin
  const [users, setUsers] = useState([]);

  // Sub-modal for rescheduling / viewing history
  const [selectedFollowUp, setSelectedFollowUp] = useState(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  
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

  const fetchFollowUps = async () => {
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
  };

  const fetchUsers = async () => {
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
  };

  const resetForm = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setMessage('');
    setCompleted(false);
    setNextFollowUpDate('');
    setAssignedToUid('');
  };

  const handleOpenUpdate = (fu) => {
    setSelectedFollowUp(fu);
    setIsUpdateModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSubmitting(true);
    try {
      let assignedToName = currentUser?.name || '';
      let targetAssignedToUid = assignedToUid;
      if (currentUser?.role === 'admin' && assignedToUid) {
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
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
          <div>
            <h2 className="text-xl font-bold text-gray-800 truncate">
              Follow-ups: {account?.name}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              History & active follow-ups for this account
            </p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:bg-gray-200 p-1 rounded transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body - Scrollable list of follow-ups */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading follow-ups...</div>
          ) : followUps.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="w-12 h-12 mx-auto text-gray-300 mb-2" />
              <p className="font-medium">No follow-ups found for this account.</p>
              <p className="text-xs text-gray-400 mt-1">Click below to add the first follow-up.</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {followUps.map(f => {
                const status = getStatusInfo(f);
                const historyCount = Array.isArray(f.history) && f.history.length > 0 ? f.history.length : 1;

                return (
                  <div key={f.id} className="bg-white border border-gray-200 rounded-lg shadow-xs relative overflow-hidden">
                    {/* Color stripe on the left */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${status.stripe}`}></div>
                    
                    <div className="p-3.5 pl-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${status.color}`}>
                            {status.icon}
                            {status.label}
                          </span>
                          <span className="text-xs text-gray-500 flex items-center">
                            <Calendar className="w-3.5 h-3.5 mr-1 text-gray-400" />
                            {f.date}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 flex items-center">
                          <User className="w-3.5 h-3.5 mr-1 text-gray-400" />
                          {f.userName}
                        </div>
                      </div>
                      
                      <div className="text-gray-800 text-sm whitespace-pre-wrap">
                        {f.message}
                      </div>

                      {/* Latest Call Info if present */}
                      {f.lastCallNote && (
                        <div className="mt-2 text-xs text-blue-900 bg-blue-50 p-2 rounded border border-blue-100 flex items-start gap-1.5">
                          <PhoneCall className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold">Latest Call:</span> {f.lastCallNote}{' '}
                            <span className="text-blue-600 font-medium">({f.lastCallBy || 'User'} on {f.lastCallDate})</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Card Footer: Next Date, Assigned, and Action buttons */}
                      <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
                        <div className="flex items-center gap-3">
                          {!f.completed && f.nextFollowUpDate && (
                            <div>
                              <span className="text-gray-400 mr-1">Next:</span>
                              <b className="text-blue-700">{f.nextFollowUpDate}</b>
                            </div>
                          )}
                          {f.assignedTo && (
                            <div>
                              <span className="text-gray-400 mr-1">Assigned:</span>
                              <span className="font-medium text-gray-700">{f.assignedTo}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {!f.completed && (
                            <button
                              type="button"
                              onClick={() => handleOpenUpdate(f)}
                              className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded font-medium transition inline-flex items-center gap-1"
                            >
                              <PhoneCall className="w-3 h-3" /> Reschedule
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenUpdate(f)}
                            className="px-2 py-1 bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 rounded font-medium transition inline-flex items-center gap-1"
                          >
                            <History className="w-3 h-3" /> History ({historyCount})
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
        <div className="border-t border-gray-200 bg-white p-4 rounded-b-lg">
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 py-2 rounded-lg font-medium transition flex items-center justify-center"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Add New Follow-up
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h3 className="font-bold text-gray-800 border-b pb-2 text-sm">New Follow-up</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Created By</label>
                  <input
                    type="text"
                    value={currentUser?.name || ''}
                    readOnly
                    className="w-full px-3 py-1.5 border border-gray-200 bg-gray-50 rounded text-gray-500 text-sm font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Message / Discussion</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={3}
                  placeholder="Enter initial follow-up details..."
                  className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="completed"
                  checked={completed}
                  onChange={(e) => setCompleted(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="completed" className="ml-2 block text-xs font-medium text-gray-900">
                  Mark as Completed (No further follow-up needed)
                </label>
              </div>

              {!completed && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Next Follow-up Date</label>
                    <input
                      type="date"
                      value={nextFollowUpDate}
                      onChange={(e) => setNextFollowUpDate(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  
                  {currentUser?.role === 'admin' && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Assign To</label>
                      <select
                        value={assignedToUid}
                        onChange={(e) => setAssignedToUid(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
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

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-1.5 rounded text-sm font-medium bg-gray-200 hover:bg-gray-300 text-gray-700 transition"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Follow-up'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Update / History Sub-modal */}
      <UpdateFollowUpModal
        isOpen={isUpdateModalOpen}
        onClose={() => { setIsUpdateModalOpen(false); setSelectedFollowUp(null); }}
        followUp={selectedFollowUp}
        currentUser={currentUser}
        users={users}
        onSuccess={fetchFollowUps}
      />
    </div>
  );
}
