import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { Search, X, Check, Clock, AlertCircle, AlertTriangle } from 'lucide-react';

const getTodayStr = () => new Date().toISOString().split('T')[0];

export default function FollowUpsTab({ currentUser }) {
  const [followUps, setFollowUps] = useState([]);
  const [filteredFollowUps, setFilteredFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  
  // Filters
  const [searchAccount, setSearchAccount] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // All, Upcoming, Overdue, Completed, Pending
  const [assignedFilter, setAssignedFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchFollowUps();
    if (currentUser?.role === 'admin') {
      fetchUsers();
    }
  }, [currentUser]);

  const fetchUsers = async () => {
    try {
      const usersQuery = query(collection(db, 'users'), orderBy('name', 'asc'));
      const snapshot = await getDocs(usersQuery);
      const usersList = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      }));
      setUsers(usersList);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchFollowUps = async () => {
    setLoading(true);
    try {
      let q;
      if (currentUser?.role === 'admin') {
        q = query(collection(db, 'followUps'), orderBy('createdAt', 'desc'));
      } else {
        q = query(
          collection(db, 'followUps'),
          where('assignedToUid', '==', currentUser?.uid),
          orderBy('createdAt', 'desc')
        );
      }
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
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
    if (fu.nextFollowUpDate >= today) return 'Upcoming';
    return 'Overdue';
  };

  const applyFilters = (data, account, status, assigned, from, to) => {
    let filtered = [...data];

    if (account) {
      const lowerSearch = account.toLowerCase();
      filtered = filtered.filter(fu => fu.accountName?.toLowerCase().includes(lowerSearch));
    }

    if (status !== 'All') {
      filtered = filtered.filter(fu => getStatus(fu) === status);
    }

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
    setStatusFilter('All');
    setAssignedFilter('All');
    setDateFrom('');
    setDateTo('');
    applyFilters(followUps, '', 'All', 'All', '', '');
  };

  const handleMarkComplete = async (id) => {
    try {
      await updateDoc(doc(db, 'followUps', id), {
        completed: true,
        nextFollowUpDate: null
      });
      // Refresh list
      fetchFollowUps();
    } catch (error) {
      console.error('Error updating follow-up:', error);
      alert('Error marking follow-up as complete');
    }
  };

  // Pagination logic
  const totalPages = Math.ceil(filteredFollowUps.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filteredFollowUps.slice(startIndex, startIndex + itemsPerPage);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Completed':
        return <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-100 text-green-800"><Check className="w-3 h-3"/> Completed</span>;
      case 'Upcoming':
        return <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3"/> Upcoming</span>;
      case 'Overdue':
        return <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-100 text-red-800"><AlertCircle className="w-3 h-3"/> Overdue</span>;
      case 'Pending':
        return <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800"><AlertTriangle className="w-3 h-3"/> Pending</span>;
      default:
        return null;
    }
  };

  const getRowClass = (status) => {
    switch (status) {
      case 'Overdue': return 'bg-red-50';
      case 'Upcoming': return 'bg-yellow-50';
      case 'Completed': return 'bg-green-50';
      default: return 'bg-white';
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] gap-4">
      <div className="bg-white rounded-lg shadow border border-gray-200 flex flex-col h-full overflow-hidden">
        
        {/* Filter Bar */}
        <div className="bg-gray-50 border-b border-gray-200 p-4 shrink-0">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-48">
              <label className="block text-xs font-medium text-gray-700 mb-1">Account Name</label>
              <input 
                type="text" 
                className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                value={searchAccount}
                onChange={e => setSearchAccount(e.target.value)}
                placeholder="Search accounts..."
              />
            </div>
            
            <div className="w-40">
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="All">All</option>
                <option value="Upcoming">Upcoming</option>
                <option value="Overdue">Overdue</option>
                <option value="Completed">Completed</option>
                <option value="Pending">Pending</option>
              </select>
            </div>

            {currentUser?.role === 'admin' && (
              <div className="w-40">
                <label className="block text-xs font-medium text-gray-700 mb-1">Assigned To</label>
                <select
                  className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
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
              <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
              <input 
                type="date" 
                className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
            </div>
            
            <div className="w-32">
              <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
              <input 
                type="date" 
                className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2 ml-auto">
              <button 
                onClick={handleSearch}
                className="px-3 py-1.5 rounded text-sm font-medium transition bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
              >
                <Search className="w-4 h-4" /> Search
              </button>
              <button 
                onClick={handleClear}
                className="px-3 py-1.5 rounded text-sm font-medium transition bg-gray-200 hover:bg-gray-300 text-gray-700 flex items-center gap-1"
              >
                <X className="w-4 h-4" /> Clear
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
              <thead className="bg-white sticky top-0 shadow-sm z-10">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Account Name</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Created By</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[200px]">Message</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Next Follow-up</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Assigned To</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {currentData.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                      No follow-ups found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  currentData.map(fu => {
                    const status = getStatus(fu);
                    return (
                      <tr key={fu.id} className={`${getRowClass(status)} hover:opacity-90`}>
                        <td className="px-4 py-2 whitespace-nowrap">{fu.date}</td>
                        <td className="px-4 py-2 font-medium">{fu.accountName}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{fu.userName}</td>
                        <td className="px-4 py-2">{fu.message}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{fu.nextFollowUpDate || '-'}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{fu.assignedTo || '-'}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{getStatusBadge(status)}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-center">
                          {!fu.completed && (
                            <button
                              onClick={() => handleMarkComplete(fu.id)}
                              className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition inline-flex items-center gap-1"
                              title="Mark as Complete"
                            >
                              <Check className="w-3 h-3" /> Complete
                            </button>
                          )}
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
    </div>
  );
}
