import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { 
  X, Calendar, User, PhoneCall, CheckCircle2, Clock, 
  History, ArrowRight, PlusCircle, MessageSquare 
} from 'lucide-react';

export default function UpdateFollowUpModal({ 
  isOpen, 
  onClose, 
  followUp, 
  currentUser, 
  users = [], 
  onSuccess 
}) {
  const [callDate, setCallDate] = useState(new Date().toISOString().split('T')[0]);
  const [callRemarks, setCallRemarks] = useState('');
  const [newNextDate, setNewNextDate] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [assignedToUid, setAssignedToUid] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('update'); // 'update' | 'history'

  useEffect(() => {
    if (isOpen && followUp) {
      setCallDate(new Date().toISOString().split('T')[0]);
      setCallRemarks('');
      setNewNextDate(followUp.nextFollowUpDate || '');
      setIsCompleted(!!followUp.completed);
      setAssignedToUid(followUp.assignedToUid || currentUser?.uid || '');
      // If already completed, default to history view
      if (followUp.completed) {
        setActiveTab('history');
      } else {
        setActiveTab('update');
      }
    }
  }, [isOpen, followUp, currentUser]);

  if (!isOpen || !followUp) return null;

  // Build full history array including legacy records without history field
  const getFullHistory = () => {
    if (Array.isArray(followUp.history) && followUp.history.length > 0) {
      return followUp.history;
    }
    // Fallback: generate initial creation history entry from legacy doc
    return [
      {
        id: 'initial',
        type: 'created',
        action: 'Created Follow-up',
        date: followUp.date || 'Initial',
        timestamp: followUp.createdAt?.toDate ? followUp.createdAt.toDate().toISOString() : null,
        userName: followUp.userName || 'Unknown',
        note: followUp.message || '',
        nextFollowUpDate: followUp.nextFollowUpDate || null,
        assignedTo: followUp.assignedTo || null
      }
    ];
  };

  const historyList = getFullHistory();

  const handleSaveUpdate = async (e) => {
    e.preventDefault();
    if (!callRemarks.trim()) {
      alert('Please enter call remarks / discussion details.');
      return;
    }

    if (!isCompleted && !newNextDate) {
      alert('Please select the next follow-up date given by the customer.');
      return;
    }

    setIsSubmitting(true);
    try {
      let targetAssignedToUid = assignedToUid;
      let assignedToName = followUp.assignedTo || currentUser?.name || '';
      
      const foundUser = users.find(u => u.uid === assignedToUid);
      if (foundUser) {
        assignedToName = foundUser.name;
      } else if (!assignedToName) {
        assignedToName = currentUser?.name || '';
        targetAssignedToUid = currentUser?.uid || '';
      }

      const newHistoryItem = {
        id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        type: isCompleted ? 'completed' : 'call_rescheduled',
        action: isCompleted ? 'Marked Completed' : 'Call Logged & Rescheduled',
        date: callDate,
        timestamp: new Date().toISOString(),
        userName: currentUser?.name || 'Unknown',
        userUid: currentUser?.uid || '',
        note: callRemarks.trim(),
        previousFollowUpDate: followUp.nextFollowUpDate || null,
        nextFollowUpDate: isCompleted ? null : newNextDate,
        assignedTo: assignedToName || null,
        assignedToUid: targetAssignedToUid || null
      };

      const updatedHistory = [...historyList, newHistoryItem];

      const updatePayload = {
        completed: isCompleted,
        nextFollowUpDate: isCompleted ? null : newNextDate,
        history: updatedHistory,
        lastUpdatedDate: callDate,
        lastCallDate: callDate,
        lastCallBy: currentUser?.name || 'Unknown',
        lastCallNote: callRemarks.trim(),
        updatedAt: serverTimestamp()
      };

      if (isCompleted) {
        updatePayload.completedAt = serverTimestamp();
        updatePayload.completedBy = currentUser?.name || 'Unknown';
      } else {
        updatePayload.assignedTo = assignedToName;
        updatePayload.assignedToUid = targetAssignedToUid;
      }

      await updateDoc(doc(db, 'followUps', followUp.id), updatePayload);

      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating follow-up:', error);
      alert('Failed to update follow-up: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gray-900 text-white flex justify-between items-center shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold truncate">
                Follow-up: {followUp.accountName}
              </h2>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 flex flex-wrap items-center gap-3">
              <span>Created by: <b className="text-gray-200">{followUp.userName}</b> ({followUp.date})</span>
              {followUp.nextFollowUpDate && (
                <span className="bg-blue-900/60 text-blue-200 px-2 py-0.5 rounded border border-blue-700/50">
                  Current Next Date: <b>{followUp.nextFollowUpDate}</b>
                </span>
              )}
              {followUp.completed && (
                <span className="bg-green-900/60 text-green-300 px-2 py-0.5 rounded border border-green-700/50 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Completed
                </span>
              )}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation (Update Form vs Full Audit History) */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-6 pt-2 shrink-0">
          {!followUp.completed && (
            <button
              onClick={() => setActiveTab('update')}
              className={`py-2 px-4 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                activeTab === 'update' 
                  ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg shadow-xs' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <PhoneCall className="w-4 h-4" />
              Log Call & Reschedule
            </button>
          )}
          <button
            onClick={() => setActiveTab('history')}
            className={`py-2 px-4 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
              activeTab === 'history' 
                ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg shadow-xs' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <History className="w-4 h-4" />
            Audit History ({historyList.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'update' ? (
            <form onSubmit={handleSaveUpdate} className="space-y-5">
              
              {/* Previous History Highlights */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 text-sm">
                <div className="font-semibold text-blue-900 mb-1 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-blue-600" /> Latest Discussion / Original Note:
                </div>
                <div className="text-gray-700 text-xs italic bg-white p-2 rounded border border-blue-100 whitespace-pre-wrap">
                  "{followUp.lastCallNote || followUp.message || 'No notes available'}"
                </div>
                {followUp.lastCallBy && (
                  <div className="text-right text-[11px] text-gray-500 mt-1">
                    Last called by: <b>{followUp.lastCallBy}</b> on {followUp.lastCallDate}
                  </div>
                )}
              </div>

              {/* Action Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Call / Action Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={callDate}
                    onChange={(e) => setCallDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Called By (Current User)
                  </label>
                  <input
                    type="text"
                    value={currentUser?.name || ''}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-lg text-gray-600 text-sm font-medium"
                  />
                </div>
              </div>

              {/* Call Remarks / Conversation Note */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex justify-between">
                  <span>Call Remarks / Customer Conversation <span className="text-red-500">*</span></span>
                  <span className="text-[11px] text-gray-400 font-normal">Details of discussion with customer</span>
                </label>
                <textarea
                  value={callRemarks}
                  onChange={(e) => setCallRemarks(e.target.value)}
                  required
                  rows={3}
                  placeholder="E.g., Customer ne bola ki Monday ko payment release karenge, tab call karein..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* Completed Toggle */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm text-gray-800 flex items-center gap-1.5">
                    <CheckCircle2 className={`w-4 h-4 ${isCompleted ? 'text-green-600' : 'text-gray-400'}`} />
                    Mark as Completed
                  </div>
                  <p className="text-xs text-gray-500">
                    Check this if the issue is solved or payment settled (it will disappear from active follow-ups).
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCompleted}
                    onChange={(e) => setIsCompleted(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>

              {/* If not completed: Reschedule Date & Assignee */}
              {!isCompleted && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-200">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1 text-blue-700">
                      <Calendar className="w-3.5 h-3.5" />
                      Next Follow-up Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={newNextDate}
                      onChange={(e) => setNewNextDate(e.target.value)}
                      required={!isCompleted}
                      className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">Naya date jo customer ne diya hai</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Assigned To
                    </label>
                    {currentUser?.role === 'admin' ? (
                      <select
                        value={assignedToUid}
                        onChange={(e) => setAssignedToUid(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                      >
                        {users.map(u => (
                          <option key={u.uid} value={u.uid}>{u.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={followUp.assignedTo || currentUser?.name || ''}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-lg text-gray-600 text-sm"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-lg text-sm font-semibold text-white transition flex items-center gap-2 shadow-sm ${
                    isCompleted 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    'Saving...'
                  ) : isCompleted ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> Save & Mark Completed
                    </>
                  ) : (
                    <>
                      <Clock className="w-4 h-4" /> Save & Reschedule
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Audit History Timeline */
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-600" /> Complete Step-by-Step History
                </h3>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                  {historyList.length} step{historyList.length !== 1 ? 's' : ''} recorded
                </span>
              </div>

              <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
                {historyList.map((step, idx) => {
                  const isCreate = step.type === 'created' || idx === 0;
                  const isComplete = step.type === 'completed';
                  
                  return (
                    <div key={step.id || idx} className="relative group">
                      {/* Timeline icon */}
                      <div className={`absolute -left-6 top-1 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center shadow-xs ${
                        isComplete 
                          ? 'border-green-500 text-green-600' 
                          : isCreate 
                            ? 'border-blue-500 text-blue-600' 
                            : 'border-amber-500 text-amber-600'
                      }`}>
                        {isComplete ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : isCreate ? (
                          <PlusCircle className="w-3 h-3" />
                        ) : (
                          <PhoneCall className="w-3 h-3" />
                        )}
                      </div>

                      {/* Step Card */}
                      <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-xs hover:border-gray-300 transition">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                              isComplete 
                                ? 'bg-green-100 text-green-800' 
                                : isCreate 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : 'bg-amber-100 text-amber-800'
                            }`}>
                              {step.action || (isComplete ? 'Marked Completed' : isCreate ? 'Created' : 'Call Logged')}
                            </span>
                            <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                              <User className="w-3 h-3 text-gray-400" />
                              {step.userName || 'Unknown'}
                            </span>
                          </div>

                          <div className="text-xs text-gray-500 flex items-center gap-2">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              {step.date}
                            </span>
                            {step.timestamp && (
                              <span className="text-[11px] text-gray-400">
                                ({formatTimestamp(step.timestamp)})
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Note / Conversation */}
                        {step.note && (
                          <div className="text-sm text-gray-800 bg-gray-50 p-2.5 rounded border border-gray-100 whitespace-pre-wrap mt-2">
                            {step.note}
                          </div>
                        )}

                        {/* Next date changes */}
                        {(step.nextFollowUpDate || step.previousFollowUpDate) && (
                          <div className="mt-2 text-xs flex items-center gap-2 text-gray-600 pt-1.5 border-t border-gray-100">
                            <Clock className="w-3.5 h-3.5 text-blue-500" />
                            {step.previousFollowUpDate && step.previousFollowUpDate !== step.nextFollowUpDate ? (
                              <span className="flex items-center gap-1.5">
                                <span className="line-through text-gray-400">{step.previousFollowUpDate}</span>
                                <ArrowRight className="w-3 h-3 text-gray-400" />
                                <span className="font-semibold text-blue-700">{step.nextFollowUpDate || 'None'}</span>
                              </span>
                            ) : (
                              <span>Next follow-up set to: <b className="text-blue-700">{step.nextFollowUpDate}</b></span>
                            )}

                            {step.assignedTo && (
                              <span className="ml-auto text-gray-500">
                                Assigned to: <b>{step.assignedTo}</b>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {followUp.completed && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  <span>This follow-up is completed and inactive. It does not require further action.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-2.5 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-xs text-gray-500 shrink-0">
          <span>Account: <b>{followUp.accountName}</b></span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-white border border-gray-300 hover:bg-gray-100 rounded text-gray-700 font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
