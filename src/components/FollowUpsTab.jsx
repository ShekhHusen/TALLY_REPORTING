import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Search, X, Check, Clock, AlertCircle, AlertTriangle, 
  FileText, PhoneCall, History, Calendar, CheckCircle2, User
} from 'lucide-react';
import AccountStatementModal from './AccountStatementModal';
import UpdateFollowUpModal from './UpdateFollowUpModal';

const getTodayStr = () => new Date().toISOString().split('T')[0];

export default function FollowUpsTab({ currentUser }) {
  const [followUps, setFollowUps] = useState([]);
  const [filteredFollowUps, setFilteredFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);

  // Statement modal state
  const [statementAccountName, setStatementAccountName] = useState('');
  const [isStatementOpen, setIsStatementOpen] = useState(false);

  // Update / Reschedule modal state
  const [selectedFollowUp, setSelectedFollowUp] = useState(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  const handleOpenStatement = (accName) => {
    setStatementAccountName(accName);
    setIsStatementOpen(true);
  };

  const handleOpenUpdate = (fu) => {
    setSelectedFollowUp(fu);
    setIsUpdateModalOpen(true);
  };
  
  // Filters - Default to 'Active' so only open follow-ups are displayed
  const [searchAccount, setSearchAccount] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active'); // Active, Today, Upcoming, Overdue, Pending, Completed, All
  const [assignedFilter, setAssignedFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchFollowUps();
    fetchUsers();
  }, [currentUser]);

  const fetchUsers = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const usersList = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      }));
      usersList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setUsers(usersList);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchFollowUps = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'followUps'));
      let data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Role-based filtering:
      // Admin sees ALL follow-ups.
      // Normal user sees ONLY follow-ups assigned to them (by UID or by Name).
      if (currentUser?.role !== 'admin') {
        const userUid = currentUser?.uid;
        const userNameLower = (currentUser?.name || '').trim().toLowerCase();
        data = data.filter(fu => {
          const matchesUid = userUid && fu.assignedToUid === userUid;
          const matchesName = fu.assignedTo && fu.assignedTo.trim().toLowerCase() === userNameLower;
          return matchesUid || matchesName;
        });
      }

      // Sort client-side descending by createdAt or date
      data.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.date ? new Date(a.date).getTime() : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.date ? new Date(b.date).getTime() : 0);
        return timeB - timeA;
      });

      setFollowUps(data);
      applyFilters(data, searchAccount, statusFilter, assignedFilter, dateFrom, dateTo);
    } catch (error) {
      console.error('Error fetching follow-ups:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatus = (fu) => {
    if (fu.completed) return 'Completed';
    if (!fu.nextFollowUpDate) return 'Pending';
    const today = getTodayStr();
    if (fu.nextFollowUpDate === today) return 'Today';
    if (fu.nextFollowUpDate > today) return 'Upcoming';
    return 'Overdue';
  };

  const applyFilters = (data, account, status, assigned, from, to) => {
    let filtered = [...data];
    const today = getTodayStr();

    if (account) {
      const lowerSearch = account.toLowerCase();
      filtered = filtered.filter(fu => fu.accountName?.toLowerCase().includes(lowerSearch));
    }

    if (status === 'Active') {
      filtered = filtered.filter(fu => !fu.completed);
    } else if (status === 'Today') {
      filtered = filtered.filter(fu => !fu.completed && fu.nextFollowUpDate === today);
    } else if (status === 'Upcoming') {
      filtered = filtered.filter(fu => !fu.completed && fu.nextFollowUpDate > today);
    } else if (status === 'Overdue') {
      filtered = filtered.filter(fu => !fu.completed && fu.nextFollowUpDate && fu.nextFollowUpDate < today);
    } else if (status === 'Pending') {
      filtered = filtered.filter(fu => !fu.completed && !fu.nextFollowUpDate);
    } else if (status === 'Completed') {
      filtered = filtered.filter(fu => !!fu.completed);
    }
    // If status === 'All', no filter on completion status

    if (assigned !== 'All') {
      filtered = filtered.filter(fu => fu.assignedToUid === assigned);
    }

    if (from) {
      filtered = filtered.filter(fu => fu.date >= from);
    }

    if (to) {
      filtered = filtered.filter(fu => fu.date <= to);
    }

    setFilteredFollowUps(filtered);
    setCurrentPage(1);
  };

  const handleSearch = () => {
    applyFilters(followUps, searchAccount, statusFilter, assignedFilter, dateFrom, dateTo);
  };

  const handleClear = () => {
    setSearchAccount('');
    setStatusFilter('Active');
    setAssignedFilter('All');
    setDateFrom('');
    setDateTo('');
    applyFilters(followUps, '', 'Active', 'All', '', '');
  };

  const handleStatusCardClick = (newStatus) => {
    setStatusFilter(newStatus);
    applyFilters(followUps, searchAccount, newStatus, assignedFilter, dateFrom, dateTo);
  };

  const handleMarkComplete = async (fu) => {
    if (!window.confirm(`Mark follow-up for "${fu.accountName}" as completed? It will be removed from the active list.`)) {
      return;
    }
    try {
      const prevHistory = (Array.isArray(fu.history) && fu.history.length > 0) ? fu.history : [
        {
          id: 'initial',
          type: 'created',
          action: 'Created Follow-up',
          date: fu.date || getTodayStr(),
          timestamp: fu.createdAt?.toDate ? fu.createdAt.toDate().toISOString() : null,
          userName: fu.userName || 'Unknown',
          note: fu.message || '',
          nextFollowUpDate: fu.nextFollowUpDate || null,
          assignedTo: fu.assignedTo || null
        }
      ];

      const newHistoryItem = {
        id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        type: 'completed',
        action: 'Marked Completed',
        date: getTodayStr(),
        timestamp: new Date().toISOString(),
        userName: currentUser?.name || 'Unknown',
        userUid: currentUser?.uid || '',
        note: 'Marked as completed directly from Follow-ups tab.'
      };

      await updateDoc(doc(db, 'followUps', fu.id), {
        completed: true,
        nextFollowUpDate: null,
        history: [...prevHistory, newHistoryItem],
        completedAt: serverTimestamp(),
        completedBy: currentUser?.name || 'Unknown',
        updatedAt: serverTimestamp()
      });
      // Refresh list
      fetchFollowUps();
    } catch (error) {
      console.error('Error updating follow-up:', error);
      alert('Error marking follow-up as complete: ' + error.message);
    }
  };

  // Quick stats counts
  const totalActive = followUps.filter(f => !f.completed).length;
  const countToday = followUps.filter(f => !f.completed && f.nextFollowUpDate === getTodayStr()).length;
  const countOverdue = followUps.filter(f => !f.completed && f.nextFollowUpDate && f.nextFollowUpDate < getTodayStr()).length;
  const countUpcoming = followUps.filter(f => !f.completed && f.nextFollowUpDate && f.nextFollowUpDate > getTodayStr()).length;
  const countCompleted = followUps.filter(f => !!f.completed).length;

  // Pagination logic
  const totalPages = Math.ceil(filteredFollowUps.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filteredFollowUps.slice(startIndex, startIndex + itemsPerPage);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Completed':
        return <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3"/> Completed</span>;
      case 'Today':
        return <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-xs"><Clock className="w-3 h-3 text-amber-600"/> Due Today</span>;
      case 'Upcoming':
        return <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800"><Calendar className="w-3 h-3"/> Upcoming</span>;
      case 'Overdue':
        return <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200"><AlertCircle className="w-3 h-3 text-red-600"/> Overdue</span>;
      case 'Pending':
        return <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700"><AlertTriangle className="w-3 h-3"/> Pending</span>;
      default:
        return null;
    }
  };

  const getRowClass = (status) => {
    switch (status) {
      case 'Today': return 'bg-amber-50/40 font-medium';
      case 'Overdue': return 'bg-red-50/50';
      case 'Upcoming': return 'bg-blue-50/20';
      case 'Completed': return 'bg-gray-50 opacity-80';
      default: return 'bg-white';
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] gap-3">
      {/* Quick Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 shrink-0">
        <button
          onClick={() => handleStatusCardClick('Active')}
          className={`p-2.5 rounded-lg border text-left transition flex items-center justify-between ${
            statusFilter === 'Active' 
              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-400/20' 
              : 'bg-white border-gray-200 hover:bg-gray-50'
          }`}
        >
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Active Follow-ups</div>
            <div className="text-xl font-bold text-gray-900">{totalActive}</div>
          </div>
          <Clock className="w-5 h-5 text-blue-500 opacity-80" />
        </button>

        <button
          onClick={() => handleStatusCardClick('Today')}
          className={`p-2.5 rounded-lg border text-left transition flex items-center justify-between ${
            statusFilter === 'Today' 
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/20' 
              : 'bg-white border-gray-200 hover:bg-gray-50'
          }`}
        >
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Due Today</div>
            <div className="text-xl font-bold text-amber-900">{countToday}</div>
          </div>
          <PhoneCall className="w-5 h-5 text-amber-500 opacity-80" />
        </button>

        <button
          onClick={() => handleStatusCardClick('Overdue')}
          className={`p-2.5 rounded-lg border text-left transition flex items-center justify-between ${
            statusFilter === 'Overdue' 
              ? 'bg-red-50 border-red-400 ring-2 ring-red-400/20' 
              : 'bg-white border-gray-200 hover:bg-gray-50'
          }`}
        >
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-red-600">Overdue</div>
            <div className="text-xl font-bold text-red-700">{countOverdue}</div>
          </div>
          <AlertCircle className="w-5 h-5 text-red-500 opacity-80" />
        </button>

        <button
          onClick={() => handleStatusCardClick('Upcoming')}
          className={`p-2.5 rounded-lg border text-left transition flex items-center justify-between ${
            statusFilter === 'Upcoming' 
              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-400/20' 
              : 'bg-white border-gray-200 hover:bg-gray-50'
          }`}
        >
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">Upcoming</div>
            <div className="text-xl font-bold text-blue-700">{countUpcoming}</div>
          </div>
          <Calendar className="w-5 h-5 text-blue-500 opacity-80" />
        </button>

        <button
          onClick={() => handleStatusCardClick('Completed')}
          className={`p-2.5 rounded-lg border text-left transition flex items-center justify-between ${
            statusFilter === 'Completed' 
              ? 'bg-green-50 border-green-400 ring-2 ring-green-400/20' 
              : 'bg-white border-gray-200 hover:bg-gray-50'
          }`}
        >
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-green-700">Completed</div>
            <div className="text-xl font-bold text-green-800">{countCompleted}</div>
          </div>
          <CheckCircle2 className="w-5 h-5 text-green-500 opacity-80" />
        </button>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 flex flex-col flex-1 overflow-hidden">
        
        {/* Filter Bar */}
        <div className="bg-gray-50 border-b border-gray-200 p-3.5 shrink-0">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="w-48">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Account Name</label>
              <input 
                type="text" 
                className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                value={searchAccount}
                onChange={e => setSearchAccount(e.target.value)}
                placeholder="Search accounts..."
              />
            </div>
            
            <div className="w-44">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Status Filter</label>
              <select
                className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="Active">Active (All Open)</option>
                <option value="Today">Due Today</option>
                <option value="Overdue">Overdue</option>
                <option value="Upcoming">Upcoming</option>
                <option value="Pending">No Date (Pending)</option>
                <option value="Completed">Completed (Archived)</option>
                <option value="All">All Records (incl. Completed)</option>
              </select>
            </div>

            {currentUser?.role === 'admin' && (
              <div className="w-40">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Assigned To</label>
                <select
                  className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                  value={assignedFilter}
                  onChange={e => setAssignedFilter(e.target.value)}
                >
                  <option value="All">All Users</option>
                  {users.map(u => (
                    <option key={u.uid} value={u.uid}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="w-32">
              <label className="block text-xs font-semibold text-gray-700 mb-1">From Date</label>
              <input 
                type="date" 
                className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
            </div>
            
            <div className="w-32">
              <label className="block text-xs font-semibold text-gray-700 mb-1">To Date</label>
              <input 
                type="date" 
                className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2 ml-auto">
              <button 
                onClick={handleSearch}
                className="px-3 py-1.5 rounded text-sm font-semibold transition bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-xs"
              >
                <Search className="w-4 h-4" /> Filter
              </button>
              <button 
                onClick={handleClear}
                className="px-3 py-1.5 rounded text-sm font-medium transition bg-gray-200 hover:bg-gray-300 text-gray-700 flex items-center gap-1"
              >
                <X className="w-4 h-4" /> Reset
              </button>
            </div>
          </div>
        </div>

        {/* Table Area */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading follow-ups...</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-100/80 sticky top-0 shadow-xs z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs whitespace-nowrap">Date</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs whitespace-nowrap">Account Name</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs whitespace-nowrap">Created By</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs whitespace-nowrap min-w-[260px]">Discussion / Message</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs whitespace-nowrap">Next Follow-up</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs whitespace-nowrap">Assigned To</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs whitespace-nowrap">Status</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-gray-600 uppercase tracking-wider text-xs whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {currentData.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-12 text-center text-gray-500">
                      <Clock className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                      <p className="font-medium">No follow-ups found matching your criteria.</p>
                      {statusFilter === 'Active' && (
                        <p className="text-xs text-gray-400 mt-1">
                          Only active follow-ups are shown by default. Completed follow-ups are filtered out.
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  currentData.map(fu => {
                    const status = getStatus(fu);
                    const historyCount = Array.isArray(fu.history) && fu.history.length > 0 ? fu.history.length : 1;

                    return (
                      <tr key={fu.id} className={`${getRowClass(status)} hover:bg-blue-50/30 transition`}>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{fu.date}</td>
                        <td className="px-4 py-2.5 font-bold text-gray-900">{fu.accountName}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{fu.userName}</td>
                        <td className="px-4 py-2.5">
                          <div className="text-gray-800 text-xs">{fu.message}</div>
                          {fu.lastCallNote && (
                            <div className="mt-1 text-[11px] text-blue-900 bg-blue-100/70 p-1.5 rounded border border-blue-200 flex items-start gap-1">
                              <PhoneCall className="w-3 h-3 text-blue-600 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold">Latest Call:</span> {fu.lastCallNote}{' '}
                                <span className="text-blue-600 font-medium">({fu.lastCallBy || 'User'} on {fu.lastCallDate})</span>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {fu.nextFollowUpDate ? (
                            <div className={`font-semibold ${status === 'Today' ? 'text-amber-700' : status === 'Overdue' ? 'text-red-600' : 'text-gray-700'}`}>
                              {fu.nextFollowUpDate}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">
                          {fu.assignedTo ? (
                            <span className="inline-flex items-center gap-1">
                              <User className="w-3 h-3 text-gray-400" />
                              {fu.assignedTo}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{getStatusBadge(status)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Update / Reschedule button */}
                            {!fu.completed && (
                              <button
                                type="button"
                                onClick={() => handleOpenUpdate(fu)}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition inline-flex items-center gap-1 shadow-xs"
                                title="Customer ne naya date diya ya call update karna hai"
                              >
                                <PhoneCall className="w-3 h-3" /> Reschedule
                              </button>
                            )}

                            {/* History button */}
                            <button
                              type="button"
                              onClick={() => handleOpenUpdate(fu)}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded text-xs font-medium transition inline-flex items-center gap-1 shadow-xs"
                              title="View Full Call & Follow-up History"
                            >
                              <History className="w-3 h-3 text-gray-500" /> 
                              <span>History</span>
                              <span className="bg-gray-200 text-gray-700 text-[10px] px-1 rounded-full font-bold">
                                {historyCount}
                              </span>
                            </button>

                            {/* Statement button */}
                            <button
                              type="button"
                              onClick={() => handleOpenStatement(fu.accountName)}
                              className="px-2 py-1 bg-white hover:bg-gray-50 text-blue-600 border border-blue-300 rounded text-xs font-medium transition inline-flex items-center gap-1 shadow-xs"
                              title="View Account Statement"
                            >
                              <FileText className="w-3 h-3" /> Statement
                            </button>

                            {/* Quick Complete button */}
                            {!fu.completed && (
                              <button
                                type="button"
                                onClick={() => handleMarkComplete(fu)}
                                className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition inline-flex items-center gap-1 shadow-xs"
                                title="Mark as Complete (Will remove from active tab)"
                              >
                                <Check className="w-3 h-3" /> Complete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Bar */}
        {!loading && filteredFollowUps.length > 0 && (
          <div className="bg-gray-50 border-t border-gray-200 p-3 flex items-center justify-between shrink-0">
            <div className="text-sm text-gray-600">
              Showing <span className="font-medium">{startIndex + 1}</span> to <span className="font-medium">{Math.min(startIndex + itemsPerPage, filteredFollowUps.length)}</span> of <span className="font-medium">{filteredFollowUps.length}</span> results
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-3 py-1 border border-gray-300 rounded text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Account Statement Modal */}
      <AccountStatementModal 
        isOpen={isStatementOpen}
        onClose={() => { setIsStatementOpen(false); setStatementAccountName(''); }}
        accountName={statementAccountName}
      />

      {/* Update / Reschedule / History Modal */}
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
