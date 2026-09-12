import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Search, X, Check, Clock, AlertCircle, AlertTriangle, 
  FileText, PhoneCall, History, Calendar, CheckCircle2, User,
  Filter, ChevronDown, ChevronUp, MoreVertical
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

  // Dropdown state
  const [activeDropdown, setActiveDropdown] = useState(null);

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleOpenStatement = (accName) => {
    setStatementAccountName(accName);
    setIsStatementOpen(true);
  };

  const handleOpenUpdate = (fu) => {
    setSelectedFollowUp(fu);
    setIsUpdateModalOpen(true);
  };
  
  // Filters - Default to 'Today' so today's follow-ups are displayed
  const [searchAccount, setSearchAccount] = useState('');
  const [statusFilter, setStatusFilter] = useState('Today'); // Active, Today, Upcoming, Overdue, Pending, Completed, All
  const [assignedFilter, setAssignedFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  
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

  const hasActiveFilters = Boolean(
    searchAccount || 
    (statusFilter !== 'Active') || 
    (assignedFilter !== 'All') || 
    dateFrom || 
    dateTo
  );

  const getStatusBadge = (status, isMobile = false) => {
    const pad = isMobile ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs";
    const iconCls = isMobile ? "w-2.5 h-2.5 shrink-0" : "w-3 h-3 shrink-0";
    switch (status) {
      case 'Completed':
        return <span className={`inline-flex items-center gap-1 font-semibold rounded-full bg-green-100 text-green-800 ${pad}`}><CheckCircle2 className={iconCls}/> Completed</span>;
      case 'Today':
        return <span className={`inline-flex items-center gap-1 font-bold rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-xs ${pad}`}><Clock className={`text-amber-600 ${iconCls}`}/> Due Today</span>;
      case 'Upcoming':
        return <span className={`inline-flex items-center gap-1 font-medium rounded-full bg-blue-100 text-blue-800 ${pad}`}><Calendar className={iconCls}/> Upcoming</span>;
      case 'Overdue':
        return <span className={`inline-flex items-center gap-1 font-semibold rounded-full bg-red-100 text-red-800 border border-red-200 ${pad}`}><AlertCircle className={`text-red-600 ${iconCls}`}/> Overdue</span>;
      case 'Pending':
        return <span className={`inline-flex items-center gap-1 font-medium rounded-full bg-gray-100 text-gray-700 ${pad}`}><AlertTriangle className={iconCls}/> Pending</span>;
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
    <div className="flex flex-col min-h-0 flex-1 gap-3 sm:gap-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
        
        {/* Unified Top Control Bar */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col gap-4 sm:gap-5 bg-white rounded-t-2xl shrink-0 relative z-20">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
            
            {/* Left: Status Nav List (Small Cards / Pills) */}
            <div className="flex-1 w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0">
              <div className="flex gap-2 min-w-max">
                {[
                  { id: 'Active', label: 'Active', count: totalActive, color: 'text-blue-700 bg-blue-100 border-blue-200' },
                  { id: 'Today', label: 'Today', count: countToday, color: 'text-amber-700 bg-amber-100 border-amber-200' },
                  { id: 'Overdue', label: 'Overdue', count: countOverdue, color: 'text-red-700 bg-red-100 border-red-200' },
                  { id: 'Upcoming', label: 'Upcoming', count: countUpcoming, color: 'text-indigo-700 bg-indigo-100 border-indigo-200' },
                  { id: 'Completed', label: 'Completed', count: countCompleted, color: 'text-green-700 bg-green-100 border-green-200' }
                ].map(statusObj => {
                  const isSelected = statusFilter === statusObj.id;
                  return (
                    <button
                      key={statusObj.id}
                      type="button"
                      onClick={() => handleStatusCardClick(statusObj.id)}
                      className={`flex items-center justify-center rounded-full text-xs font-bold transition-all border ${statusObj.color} ${
                        isSelected 
                          ? 'px-3 py-1.5 gap-1.5 shadow-sm ring-2 ring-offset-1 ' + statusObj.color.split(' ')[2].replace('border', 'ring') // uses the border color for ring
                          : 'w-8 h-8 opacity-75 hover:opacity-100 shadow-sm'
                      }`}
                      title={`${statusObj.label}: ${statusObj.count}`}
                    >
                      {isSelected ? (
                        <>
                          <span>{statusObj.label}</span>
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/60">
                            {statusObj.count}
                          </span>
                        </>
                      ) : (
                        <span>{statusObj.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Center: Account Name */}
            <div className="shrink-0 w-full md:w-64">
              <input 
                type="text" 
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 font-medium transition-colors"
                value={searchAccount}
                onChange={e => {
                  setSearchAccount(e.target.value);
                  // Optional: Auto-search as they type, or let them click Apply
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
                placeholder="Search account name..."
              />
            </div>

            {/* Right: Filter Button */}
            <div className="shrink-0 w-full md:w-auto flex gap-2">
              <button
                type="button"
                onClick={() => setShowMobileFilters(true)}
                className="flex-1 md:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-800 hover:bg-gray-100 transition shadow-sm"
              >
                <Filter className="w-4 h-4 text-blue-600" />
                <span>Filters</span>
                {hasActiveFilters && (
                  <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1">
                    •
                  </span>
                )}
                {showMobileFilters ? <ChevronUp className="w-4 h-4 text-gray-400 ml-1 hidden md:block" /> : <ChevronDown className="w-4 h-4 text-gray-400 ml-1 hidden md:block" />}
              </button>
            </div>
          </div>
        </div>

        {/* Filter Popup / Modal */}
        {showMobileFilters && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-4">
            <div 
              className="fixed inset-0 bg-black/50 transition-opacity"
              onClick={() => setShowMobileFilters(false)}
            ></div>
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl z-[101] flex flex-col w-full max-w-lg max-h-[85vh] absolute bottom-0 sm:relative sm:bottom-auto">
              {/* Header */}
              <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 shrink-0">
                <h3 className="font-extrabold text-gray-900 text-lg flex items-center gap-2">
                  <Filter size={18} className="text-blue-600" /> Filters & Options
                </h3>
                <button onClick={() => setShowMobileFilters(false)} className="p-1.5 bg-gray-100 text-gray-500 hover:bg-gray-200 rounded-full transition">
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
                
                {/* Status Filter */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status Filter</label>
                  <select
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
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

                {/* Assigned To */}
                {currentUser?.role === 'admin' && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Assigned To</label>
                    <select
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
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

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">From Date</label>
                    <input 
                      type="date" 
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">To Date</label>
                    <input 
                      type="date" 
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
                    />
                  </div>
                </div>

              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-2 p-5 pt-3 border-t border-gray-100 bg-white shrink-0 pb-safe sm:rounded-b-2xl">
                <div className="flex gap-2">
                  <button 
                    onClick={() => { handleClear(); setShowMobileFilters(false); }}
                    className="flex-[1] py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-bold transition"
                  >
                    Clear
                  </button>
                  <button 
                    onClick={() => { handleSearch(); setShowMobileFilters(false); }}
                    className="flex-[2] py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-bold shadow-md transition"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Table Area */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading follow-ups...</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm hidden md:table">
              <thead className="bg-gray-100/80 sticky top-0 shadow-xs z-10">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-[11px] w-px whitespace-nowrap">Actions</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-[11px] w-px whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-[11px] w-px whitespace-nowrap">Created By</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-[11px] whitespace-nowrap">Account Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-[11px] w-full min-w-[250px]">Discussion / Message</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-[11px] w-px whitespace-nowrap">Next Follow-up</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-[11px] w-px whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-[11px] w-px whitespace-nowrap">Assigned To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {currentData.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-16 text-center text-gray-500 bg-gray-50/50">
                      <Clock className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                      <p className="font-bold text-gray-600">No follow-ups found matching your criteria.</p>
                      {statusFilter === 'Today' && (
                        <p className="text-xs text-gray-500 mt-1">
                          Only today's follow-ups are shown by default.
                        </p>
                      )}
                      {statusFilter === 'Active' && (
                        <p className="text-xs text-gray-500 mt-1">
                          Completed follow-ups are filtered out.
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  currentData.map(fu => {
                    const status = getStatus(fu);
                    const historyCount = Array.isArray(fu.history) && fu.history.length > 0 ? fu.history.length : 1;

                    return (
                      <tr key={fu.id} className={`${getRowClass(status)} hover:bg-blue-50/40 transition-colors group`}>
                        {/* Actions */}
                        <td className="px-4 py-3.5 align-middle w-px whitespace-nowrap relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdown(activeDropdown === fu.id ? null : fu.id);
                            }}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                          >
                            <MoreVertical className="w-5 h-5" />
                          </button>

                          {activeDropdown === fu.id && (
                            <div className="absolute left-10 top-2 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-lg z-50 py-1 flex flex-col" onClick={(e) => e.stopPropagation()}>
                              {!fu.completed && (
                                <button
                                  type="button"
                                  onClick={() => { setActiveDropdown(null); handleOpenUpdate(fu); }}
                                  className="px-4 py-2 text-left text-sm font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2"
                                >
                                  <PhoneCall className="w-4 h-4 text-blue-500" /> Update
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => { setActiveDropdown(null); handleOpenUpdate(fu); }}
                                className="px-4 py-2 text-left text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <History className="w-4 h-4 text-gray-400" /> History ({historyCount})
                              </button>
                              <button
                                type="button"
                                onClick={() => { setActiveDropdown(null); handleOpenStatement(fu.accountName); }}
                                className="px-4 py-2 text-left text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <FileText className="w-4 h-4 text-gray-400" /> Ledger
                              </button>
                              {!fu.completed && (
                                <button
                                  type="button"
                                  onClick={() => { setActiveDropdown(null); handleMarkComplete(fu); }}
                                  className="px-4 py-2 text-left text-sm font-bold text-green-700 hover:bg-green-50 flex items-center gap-2"
                                >
                                  <Check className="w-4 h-4 text-green-600" /> Resolve
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3.5 align-middle w-px whitespace-nowrap text-sm font-bold text-gray-900">
                          {fu.date}
                        </td>

                        {/* Created By */}
                        <td className="px-4 py-3.5 align-middle w-px whitespace-nowrap text-sm font-bold text-gray-600">
                          {fu.userName}
                        </td>

                        {/* Account Name */}
                        <td className="px-4 py-3.5 align-middle whitespace-nowrap text-sm font-bold text-gray-900">
                          {fu.accountName}
                        </td>

                        {/* Discussion / Message */}
                        <td className="px-4 py-3.5 align-middle w-full min-w-[250px]">
                          <div className="text-gray-700 text-sm font-bold leading-relaxed whitespace-normal pr-4">{fu.message || <span className="italic text-gray-400">No message</span>}</div>
                          {fu.lastCallNote && (
                            <div className="mt-2 text-[11px] text-blue-900 bg-blue-50 p-2 rounded border border-blue-100 flex items-start gap-1.5 w-fit max-w-full">
                              <PhoneCall className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                              <div className="leading-tight font-bold">
                                <span className="text-blue-800">Latest Call:</span> <span className="opacity-90">{fu.lastCallNote}</span>{' '}
                                <span className="text-blue-600 font-bold opacity-80 whitespace-nowrap">({fu.lastCallBy || 'User'} • {fu.lastCallDate})</span>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Next Follow-up */}
                        <td className="px-4 py-3.5 align-middle w-px whitespace-nowrap">
                          {fu.nextFollowUpDate ? (
                            <div className={`font-bold text-sm ${status === 'Today' ? 'text-amber-600' : status === 'Overdue' ? 'text-red-600' : 'text-gray-700'}`}>
                              {fu.nextFollowUpDate}
                            </div>
                          ) : (
                            <span className="text-gray-300 font-bold">-</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 align-middle w-px whitespace-nowrap">
                          {getStatusBadge(status)}
                        </td>

                        {/* Assigned To */}
                        <td className="px-4 py-3.5 align-middle w-px whitespace-nowrap">
                          {fu.assignedTo ? (
                            <span className="inline-flex items-center gap-1 text-sm font-bold text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-200 shadow-xs">
                              <User className="w-3 h-3 text-gray-400" />
                              {fu.assignedTo}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400 font-bold px-1">Unassigned</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
          {/* Mobile Card View */}
          <div className="block md:hidden bg-gray-50/50 p-3 space-y-3">
            {currentData.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">
                <Clock className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="font-medium text-sm">No follow-ups found.</p>
              </div>
            ) : (
              currentData.map(fu => {
                const status = getStatus(fu);
                const historyCount = Array.isArray(fu.history) && fu.history.length > 0 ? fu.history.length : 1;
                const statusColors = {
                  'Today': 'bg-amber-500',
                  'Overdue': 'bg-red-500',
                  'Upcoming': 'bg-blue-500',
                  'Completed': 'bg-green-500',
                  'Pending': 'bg-gray-400'
                };
                return (
                  <div key={fu.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 overflow-hidden relative">
                    {/* Status Stripe */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusColors[status] || 'bg-gray-300'}`}></div>
                    
                    {/* Top row: Account name + Status badge */}
                    <div className="flex items-start justify-between gap-1.5 mb-1.5 pl-2">
                      <h4 className="font-extrabold text-sm text-gray-900 leading-tight truncate" title={fu.accountName}>
                        {fu.accountName}
                      </h4>
                      <div className="shrink-0 scale-90 origin-top-right">
                        {getStatusBadge(status, true)}
                      </div>
                    </div>
                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-gray-500 mb-2 pl-2">
                      <span>{fu.date}</span>
                      <span>by <span className="font-bold text-gray-700">{fu.userName}</span></span>
                      {fu.assignedTo && (
                        <span className="inline-flex items-center gap-0.5 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                          <User className="w-3 h-3 text-gray-400" /> {fu.assignedTo}
                        </span>
                      )}
                      {fu.nextFollowUpDate && (
                        <span className={`font-bold ${status === 'Today' ? 'text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100' : status === 'Overdue' ? 'text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-100' : 'text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100'}`}>
                          Next: {fu.nextFollowUpDate}
                        </span>
                      )}
                    </div>
                    {/* Message */}
                    {fu.message && (
                      <div className="text-xs text-gray-700 mb-2 leading-relaxed line-clamp-2 pl-2" title={fu.message}>
                        {fu.message}
                      </div>
                    )}
                    {fu.lastCallNote && (
                      <div className="text-[11px] text-blue-900 bg-blue-50/50 p-2 rounded-lg border border-blue-100 flex items-start gap-1.5 mb-2.5 ml-2">
                        <PhoneCall className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <div className="leading-snug">
                          <span className="font-bold text-blue-800">Call:</span> {fu.lastCallNote}{' '}
                          <span className="text-blue-600 font-bold opacity-80">({fu.lastCallBy || 'User'} on {fu.lastCallDate})</span>
                        </div>
                      </div>
                    )}
                    {/* Action buttons: Exactly 1 row 4 columns */}
                    <div className={`grid ${fu.completed ? 'grid-cols-2' : 'grid-cols-4'} gap-1.5 mt-2 pl-2`}>
                      {!fu.completed && (
                        <button
                          type="button"
                          onClick={() => handleOpenUpdate(fu)}
                          className="py-1.5 px-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1 shadow-sm truncate"
                          title="Reschedule"
                        >
                          <PhoneCall className="w-3 h-3 shrink-0" />
                          <span className="truncate">Reschedule</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenUpdate(fu)}
                        className="py-1.5 px-1 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1 shadow-sm truncate"
                        title="History"
                      >
                        <History className="w-3 h-3 text-gray-500 shrink-0" />
                        <span className="truncate">History</span>
                        <span className="bg-white border border-gray-200 text-gray-700 text-[9px] px-1.5 rounded-full font-black shrink-0 shadow-sm">{historyCount}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenStatement(fu.accountName)}
                        className="py-1.5 px-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1 shadow-sm truncate"
                        title="Statement"
                      >
                        <FileText className="w-3 h-3 shrink-0" />
                        <span className="truncate">Stmt</span>
                      </button>
                      {!fu.completed && (
                        <button
                          type="button"
                          onClick={() => handleMarkComplete(fu)}
                          className="py-1.5 px-1 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1 shadow-sm truncate"
                          title="Complete"
                        >
                          <Check className="w-3 h-3 shrink-0 text-green-600" />
                          <span className="truncate">Complete</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Pagination Bar */}
        {!loading && filteredFollowUps.length > 0 && (
          <div className="bg-white border-t border-gray-100 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Showing <span className="text-gray-900">{startIndex + 1}</span> to <span className="text-gray-900">{Math.min(startIndex + itemsPerPage, filteredFollowUps.length)}</span> of <span className="text-gray-900">{filteredFollowUps.length}</span> results
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm text-gray-700"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm text-gray-700"
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
