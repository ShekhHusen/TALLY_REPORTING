import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Search, X, Check, Clock, AlertCircle, AlertTriangle, 
  FileText, PhoneCall, History, Calendar, CheckCircle2, User,
  Filter, ChevronDown, ChevronUp
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
    <div className="flex flex-col min-h-0 md:h-[calc(100vh-10rem)] gap-2.5 sm:gap-3">
      {/* Quick Summary Bar - Compact on mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 shrink-0 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
        <button
          onClick={() => handleStatusCardClick('Active')}
          className={`p-3 sm:p-4 rounded-xl border text-left transition-colors flex items-center justify-between shadow-sm ${
            statusFilter === 'Active' 
              ? 'bg-blue-600 border-blue-600 text-white' 
              : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-md'
          }`}
        >
          <div>
            <div className={`text-[10px] sm:text-xs font-extrabold uppercase tracking-wider ${statusFilter === 'Active' ? 'text-blue-100' : 'text-gray-500'}`}>Active Follow-ups</div>
            <div className={`text-lg sm:text-2xl font-black ${statusFilter === 'Active' ? 'text-white' : 'text-gray-900'}`}>{totalActive}</div>
          </div>
          <Clock className={`w-6 h-6 sm:w-8 sm:h-8 opacity-80 shrink-0 ${statusFilter === 'Active' ? 'text-blue-200' : 'text-blue-500'}`} />
        </button>

        <button
          onClick={() => handleStatusCardClick('Today')}
          className={`p-3 sm:p-4 rounded-xl border text-left transition-colors flex items-center justify-between shadow-sm ${
            statusFilter === 'Today' 
              ? 'bg-amber-500 border-amber-500 text-white' 
              : 'bg-white border-gray-200 hover:border-amber-300 hover:shadow-md'
          }`}
        >
          <div>
            <div className={`text-[10px] sm:text-xs font-extrabold uppercase tracking-wider ${statusFilter === 'Today' ? 'text-amber-100' : 'text-amber-600'}`}>Due Today</div>
            <div className={`text-lg sm:text-2xl font-black ${statusFilter === 'Today' ? 'text-white' : 'text-amber-700'}`}>{countToday}</div>
          </div>
          <PhoneCall className={`w-6 h-6 sm:w-8 sm:h-8 opacity-80 shrink-0 ${statusFilter === 'Today' ? 'text-amber-200' : 'text-amber-500'}`} />
        </button>

        <button
          onClick={() => handleStatusCardClick('Overdue')}
          className={`p-3 sm:p-4 rounded-xl border text-left transition-colors flex items-center justify-between shadow-sm ${
            statusFilter === 'Overdue' 
              ? 'bg-red-500 border-red-500 text-white' 
              : 'bg-white border-gray-200 hover:border-red-300 hover:shadow-md'
          }`}
        >
          <div>
            <div className={`text-[10px] sm:text-xs font-extrabold uppercase tracking-wider ${statusFilter === 'Overdue' ? 'text-red-100' : 'text-red-600'}`}>Overdue</div>
            <div className={`text-lg sm:text-2xl font-black ${statusFilter === 'Overdue' ? 'text-white' : 'text-red-700'}`}>{countOverdue}</div>
          </div>
          <AlertCircle className={`w-6 h-6 sm:w-8 sm:h-8 opacity-80 shrink-0 ${statusFilter === 'Overdue' ? 'text-red-200' : 'text-red-500'}`} />
        </button>

        <button
          onClick={() => handleStatusCardClick('Upcoming')}
          className={`p-3 sm:p-4 rounded-xl border text-left transition-colors flex items-center justify-between shadow-sm ${
            statusFilter === 'Upcoming' 
              ? 'bg-blue-400 border-blue-400 text-white' 
              : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-md'
          }`}
        >
          <div>
            <div className={`text-[10px] sm:text-xs font-extrabold uppercase tracking-wider ${statusFilter === 'Upcoming' ? 'text-blue-100' : 'text-blue-600'}`}>Upcoming</div>
            <div className={`text-lg sm:text-2xl font-black ${statusFilter === 'Upcoming' ? 'text-white' : 'text-blue-700'}`}>{countUpcoming}</div>
          </div>
          <Calendar className={`w-6 h-6 sm:w-8 sm:h-8 opacity-80 shrink-0 ${statusFilter === 'Upcoming' ? 'text-blue-200' : 'text-blue-500'}`} />
        </button>

        <button
          onClick={() => handleStatusCardClick('Completed')}
          className={`p-3 sm:p-4 rounded-xl border text-left transition-colors flex items-center justify-between shadow-sm ${
            statusFilter === 'Completed' 
              ? 'bg-green-500 border-green-500 text-white' 
              : 'bg-white border-gray-200 hover:border-green-300 hover:shadow-md'
          }`}
        >
          <div>
            <div className={`text-[10px] sm:text-xs font-extrabold uppercase tracking-wider ${statusFilter === 'Completed' ? 'text-green-100' : 'text-green-600'}`}>Completed</div>
            <div className={`text-lg sm:text-2xl font-black ${statusFilter === 'Completed' ? 'text-white' : 'text-green-700'}`}>{countCompleted}</div>
          </div>
          <CheckCircle2 className={`w-6 h-6 sm:w-8 sm:h-8 opacity-80 shrink-0 ${statusFilter === 'Completed' ? 'text-green-200' : 'text-green-500'}`} />
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col flex-1 overflow-hidden">
        
        {/* Mobile Filter Toggle Bar (Hidden on desktop, visible on mobile) */}
        <div className="md:hidden flex items-center justify-between p-3 bg-white border-b border-gray-100 shrink-0">
          <button
            type="button"
            onClick={() => setShowMobileFilters(true)}
            className="flex items-center gap-2 text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 px-3.5 py-2 rounded-lg shadow-sm transition-colors hover:bg-gray-100"
          >
            <Filter className="w-4 h-4 text-blue-600" />
            <span>Filters & Search</span>
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-blue-600 ml-1"></span>
            )}
          </button>
           
          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-red-600 font-bold hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Reset
              </button>
            )}
            <span className="text-xs text-gray-500 font-bold bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100">
              {filteredFollowUps.length} record{filteredFollowUps.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Desktop Filter Bar */}
        <div className="hidden md:block bg-white border-b border-gray-100 p-3 sm:p-4 shrink-0 shadow-sm z-10 relative">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="w-full sm:w-48">
              <label className="block text-[10px] font-extrabold text-gray-500 mb-1.5 uppercase tracking-wider">Account Name</label>
              <input 
                type="text" 
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 font-medium transition-colors"
                value={searchAccount}
                onChange={e => setSearchAccount(e.target.value)}
                placeholder="Search accounts..."
              />
            </div>
            
            <div className="w-full sm:w-44">
              <label className="block text-[10px] font-extrabold text-gray-500 mb-1.5 uppercase tracking-wider">Status Filter</label>
              <select
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 font-medium transition-colors cursor-pointer"
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
              <div className="w-full sm:w-40">
                <label className="block text-[10px] font-extrabold text-gray-500 mb-1.5 uppercase tracking-wider">Assigned To</label>
                <select
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 font-medium transition-colors cursor-pointer"
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

            <div className="w-full sm:w-32">
              <label className="block text-[10px] font-extrabold text-gray-500 mb-1.5 uppercase tracking-wider">From Date</label>
              <input 
                type="date" 
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 font-medium transition-colors"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
            </div>
            
            <div className="w-full sm:w-32">
              <label className="block text-[10px] font-extrabold text-gray-500 mb-1.5 uppercase tracking-wider">To Date</label>
              <input 
                type="date" 
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 font-medium transition-colors"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2 w-full sm:w-auto sm:ml-auto pt-1">
              <button 
                onClick={handleSearch}
                className="px-5 py-2.5 rounded-lg text-sm font-bold transition-colors bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 shadow-sm flex-1 sm:flex-none"
              >
                <Search className="w-4 h-4" /> Filter
              </button>
              <button 
                onClick={handleClear}
                className="px-5 py-2.5 rounded-lg text-sm font-bold transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center gap-2 flex-1 sm:flex-none"
              >
                <X className="w-4 h-4" /> Reset
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Bottom Sheet Filters */}
        {showMobileFilters && (
          <>
            <div 
              className="fixed inset-0 bg-black/40 z-40 md:hidden transition-opacity"
              onClick={() => setShowMobileFilters(false)}
            ></div>
            <div className="fixed inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-xl z-50 p-5 pb-safe flex flex-col gap-4 md:hidden max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom-full duration-200">
              <div className="flex justify-between items-center mb-1 border-b border-gray-100 pb-3">
                <h3 className="font-extrabold text-gray-900 text-lg flex items-center gap-2">
                  <Filter size={18} className="text-blue-600" /> Filters & Search
                </h3>
                <button onClick={() => setShowMobileFilters(false)} className="p-1.5 bg-gray-100 text-gray-500 hover:bg-gray-200 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-[10px] font-extrabold text-gray-500 mb-1.5 uppercase tracking-wider">Account Name</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 font-medium transition-colors"
                    value={searchAccount}
                    onChange={e => setSearchAccount(e.target.value)}
                    placeholder="Search accounts..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-gray-500 mb-1.5 uppercase tracking-wider">Status Filter</label>
                  <select
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 font-medium transition-colors cursor-pointer"
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
                  <div>
                    <label className="block text-[10px] font-extrabold text-gray-500 mb-1.5 uppercase tracking-wider">Assigned To</label>
                    <select
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 font-medium transition-colors cursor-pointer"
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold text-gray-500 mb-1.5 uppercase tracking-wider">From Date</label>
                    <input 
                      type="date" 
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 font-medium transition-colors"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-gray-500 mb-1.5 uppercase tracking-wider">To Date</label>
                    <input 
                      type="date" 
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 font-medium transition-colors"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-gray-100">
                <button 
                  onClick={() => { handleSearch(); setShowMobileFilters(false); }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl text-sm font-bold shadow-sm transition-colors flex justify-center items-center gap-2"
                >
                  <Search size={16} /> Apply Filters
                </button>
                <button 
                  onClick={() => { handleClear(); setShowMobileFilters(false); }}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3.5 rounded-xl text-sm font-bold transition-colors"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          </>
        )}

        {/* Table Area */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading follow-ups...</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm hidden md:table">
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
