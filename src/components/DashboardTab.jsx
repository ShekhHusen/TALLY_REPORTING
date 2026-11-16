import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, collectionGroup } from 'firebase/firestore';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';
import {
    Briefcase, CheckCircle2, Clock, AlertTriangle,
    CalendarCheck2, Calendar, AlertCircle, ArrowUpRight,
    Users, IndianRupee, TrendingUp, Eye
} from 'lucide-react';

const getTodayStr = () => new Date().toISOString().split('T')[0];
const currentMonthStr = () => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};
const monthDisplay = (m) => {
    if (!m) return '';
    const [y, mo] = m.split('-');
    return new Date(+y, +mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
const fmtCurrency = (n) => 'Rs.' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DashboardTab({ currentUser, setActiveTab }) {

    /* ── Role checks ─────────────────────────────────────────────── */
    const isSuperAdmin = Boolean(currentUser?.role === 'admin' && currentUser?.adminType !== 'secondary');
    const isSecondaryAdmin = Boolean(currentUser?.role === 'secondary_admin' || (currentUser?.role === 'admin' && currentUser?.adminType === 'secondary'));
    const isAdmin = isSuperAdmin || isSecondaryAdmin;

    /* ── Loading states ──────────────────────────────────────────── */
    const [loadingAccounts, setLoadingAccounts] = useState(true);
    const [loadingFollowUps, setLoadingFollowUps] = useState(true);
    const [loadingEmployees, setLoadingEmployees] = useState(true);

    /* ── Account stats ───────────────────────────────────────────── */
    const [allAccounts, setAllAccounts] = useState([]);
    const [fyBalances, setFyBalances] = useState({});
    const [selectedFY, setSelectedFY] = useState('');

    /* ── Follow-up stats ─────────────────────────────────────────── */
    const [followUps, setFollowUps] = useState([]);

    /* ── Employee pay data ───────────────────────────────────────── */
    const [employees, setEmployees] = useState([]);
    const [attendanceRecords, setAttendanceRecords] = useState([]);
    const selectedMonth = currentMonthStr();

    /* ── Linked employee for non-admin users ──────────────────────── */
    const [linkedEmployee, setLinkedEmployee] = useState(null);

    /* ══════════════════════════════════════════════════════════════
       DATA FETCHING
       ══════════════════════════════════════════════════════════════ */

    // Fetch accounts + FY balances
    useEffect(() => {
        const fetchAccountData = async () => {
            setLoadingAccounts(true);
            try {
                const [fys, snap] = await Promise.all([
                    fetchFiscalYears(),
                    getDocs(collection(db, 'accounts'))
                ]);

                const current = getCurrentFYObject(fys);
                const fyId = current ? current.id : (fys.length > 0 ? fys[0].id : '');
                setSelectedFY(fyId);

                // Process accounts with deduplication (same as AccountsTab)
                const accMap = new Map();
                snap.forEach(d => {
                    const data = d.data();
                    const name = (data.name || '').trim();
                    if (!name) return;
                    const key = name.toLowerCase();

                    if (!accMap.has(key)) {
                        accMap.set(key, {
                            id: d.id, ...data, name,
                            allDocIds: [d.id]
                        });
                    } else {
                        const existing = accMap.get(key);
                        const allDocIds = [...new Set([...(existing.allDocIds || [existing.id]), d.id])];
                        accMap.set(key, {
                            ...existing,
                            id: existing.id,
                            name: existing.name || name,
                            group: data.group || existing.group || '',
                            verifiedBy: data.verifiedBy || existing.verifiedBy || null,
                            allDocIds
                        });
                    }
                });
                const accs = Array.from(accMap.values());
                setAllAccounts(accs);

                // Fetch FY balances
                if (fyId) {
                    try {
                        const q = query(
                            collectionGroup(db, 'fiscalYears'),
                            where('fyId', '==', fyId)
                        );
                        const fySnap = await getDocs(q);

                        const accountDocIdToLogicalId = {};
                        accs.forEach(acc => {
                            const ids = acc.allDocIds && acc.allDocIds.length > 0 ? acc.allDocIds : [acc.id];
                            ids.forEach(id => { accountDocIdToLogicalId[id] = acc.id; });
                        });

                        const balances = {};
                        fySnap.forEach(docSnap => {
                            const parentRef = docSnap.ref.parent?.parent;
                            if (parentRef) {
                                const logicalId = accountDocIdToLogicalId[parentRef.id];
                                if (logicalId && !balances[logicalId]) {
                                    balances[logicalId] = docSnap.data();
                                }
                            }
                        });
                        setFyBalances(balances);
                    } catch {
                        // Fallback: no FY balances
                    }
                }
            } catch (err) {
                console.error('Dashboard: Error loading accounts:', err);
            } finally {
                setLoadingAccounts(false);
            }
        };
        fetchAccountData();
    }, []);

    // Fetch follow-ups
    useEffect(() => {
        const fetchFollowUpData = async () => {
            setLoadingFollowUps(true);
            try {
                const snapshot = await getDocs(collection(db, 'followUps'));
                let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Role-based filtering (same as FollowUpsTab)
                if (!isAdmin) {
                    const userUid = currentUser?.uid;
                    const userNameLower = (currentUser?.name || '').trim().toLowerCase();
                    data = data.filter(fu => {
                        const matchesUid = userUid && fu.assignedToUid === userUid;
                        const matchesName = fu.assignedTo && fu.assignedTo.trim().toLowerCase() === userNameLower;
                        return matchesUid || matchesName;
                    });
                }

                setFollowUps(data);
            } catch (err) {
                console.error('Dashboard: Error loading follow-ups:', err);
            } finally {
                setLoadingFollowUps(false);
            }
        };
        fetchFollowUpData();
    }, [currentUser]);

    // Fetch employees + attendance for current month
    useEffect(() => {
        const fetchEmployeeData = async () => {
            setLoadingEmployees(true);
            try {
                const [empSnap, attSnap] = await Promise.all([
                    getDocs(collection(db, 'employees')),
                    getDocs(query(collection(db, 'attendance'), where('month', '==', selectedMonth)))
                ]);

                const empList = [];
                empSnap.forEach(d => empList.push({ id: d.id, ...d.data() }));
                empList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                setEmployees(empList);

                let attRecords = [];
                attSnap.forEach(d => attRecords.push({ id: d.id, ...d.data() }));

                // For non-admin users, check if linked to an employee
                if (!isAdmin && currentUser?.uid) {
                    const linked = empList.find(e => e.linkedUserId === currentUser.uid);
                    if (linked) {
                        setLinkedEmployee(linked);
                        attRecords = attRecords.filter(r => r.employeeId === linked.id);
                    }
                }

                setAttendanceRecords(attRecords);
            } catch (err) {
                console.error('Dashboard: Error loading employees:', err);
            } finally {
                setLoadingEmployees(false);
            }
        };
        fetchEmployeeData();
    }, [currentUser, isAdmin]);

    /* ══════════════════════════════════════════════════════════════
       COMPUTED STATS
       ══════════════════════════════════════════════════════════════ */

    // --- Account Stats ---
    const accountStats = useMemo(() => {
        const ignoredList = currentUser?.ignoredAccounts || [];
        let filteredAccs = allAccounts;

        // For restricted users, only show their allowed account
        if (currentUser?.allowedAccount) {
            filteredAccs = allAccounts.filter(a => 
                a.name.toLowerCase() === currentUser.allowedAccount.toLowerCase()
            );
        }

        const total = filteredAccs.length;

        // Verified = has verifiedBy in FY balance
        const verified = filteredAccs.filter(a => {
            if (ignoredList.includes(a.id) || a.allDocIds?.some(id => ignoredList.includes(id))) return false;
            return !!fyBalances[a.id]?.verifiedBy;
        }).length;

        // Ignored
        const ignored = filteredAccs.filter(a => {
            return ignoredList.includes(a.id) || (a.allDocIds?.some(id => ignoredList.includes(id)));
        }).length;

        // Non-ignored, non-verified = pending
        const pending = total - verified - ignored;

        return { total, verified, pending: Math.max(0, pending), ignored };
    }, [allAccounts, fyBalances, currentUser]);

    // --- Follow-up Stats ---
    const followUpStats = useMemo(() => {
        const today = getTodayStr();
        const active = followUps.filter(f => !f.completed).length;
        const todayCount = followUps.filter(f => !f.completed && f.nextFollowUpDate === today).length;
        const overdue = followUps.filter(f => !f.completed && f.nextFollowUpDate && f.nextFollowUpDate < today).length;
        const upcoming = followUps.filter(f => !f.completed && f.nextFollowUpDate && f.nextFollowUpDate > today).length;
        return { active, today: todayCount, overdue, upcoming };
    }, [followUps]);

    // --- Employee Monthly Pay Report ---
    const monthlySummary = useMemo(() => {
        const summary = {};
        attendanceRecords.forEach(record => {
            if (!summary[record.employeeId]) {
                const emp = employees.find(e => e.id === record.employeeId);
                summary[record.employeeId] = {
                    employeeId: record.employeeId,
                    employeeName: record.employeeName,
                    present: 0, saturday: 0, paidLeave: 0, unpaidLeave: 0,
                    monthlySalary: emp?.monthlySalary || 0,
                    perDaySalary: emp?.perDaySalary || 0,
                };
            }
            const e = summary[record.employeeId];
            if (record.type === 'Present') e.present++;
            else if (record.type === 'Saturday') e.saturday++;
            else if (record.type === 'Paid Leave') e.paidLeave++;
            else if (record.type === 'Unpaid Leave') e.unpaidLeave++;
        });
        return Object.values(summary).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    }, [attendanceRecords, employees]);

    const totalPayable = useMemo(() => {
        return monthlySummary.reduce((sum, emp) => {
            const paidDays = emp.present + emp.saturday + emp.paidLeave;
            const payable = paidDays * emp.perDaySalary;
            return sum + payable;
        }, 0);
    }, [monthlySummary]);

    /* ══════════════════════════════════════════════════════════════
       CLICK HANDLERS (redirect to respective tabs with filters)
       ══════════════════════════════════════════════════════════════ */

    const navigateTo = (tabId) => {
        if (setActiveTab) setActiveTab(tabId);
    };

    /* ══════════════════════════════════════════════════════════════
       SKELETON LOADER
       ══════════════════════════════════════════════════════════════ */
    const SkeletonCard = () => (
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-24 mb-3"></div>
            <div className="h-8 bg-slate-200 rounded w-16 mb-2"></div>
            <div className="h-3 bg-slate-100 rounded w-32"></div>
        </div>
    );

    /* ══════════════════════════════════════════════════════════════
       RENDER
       ══════════════════════════════════════════════════════════════ */
    return (
        <div className="flex-1 overflow-y-auto space-y-6 pb-6">

            {/* ── Greeting Header ─────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                        Welcome, {currentUser?.name?.split(' ')[0] || 'User'}
                    </h2>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
               SECTION 1: Account Stats
               ══════════════════════════════════════════════════════════════ */}
            <section>
                <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-base font-black text-slate-800 tracking-tight">Account Overview</h3>
                </div>

                {loadingAccounts ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                        {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">

                        {/* All Accounts */}
                        <button
                            onClick={() => navigateTo('accounts')}
                            className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 p-2 md:p-3 text-center group cursor-pointer"
                        >
                            
                            <p className="text-lg md:text-xl font-black text-emerald-700">{accountStats.total}</p>
                            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">All Accounts</p>
                        </button>

                        {/* Verified */}
                        <button
                            onClick={() => navigateTo('accounts')}
                            className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-200 p-2 md:p-3 text-center group cursor-pointer"
                        >
                            
                            <p className="text-lg md:text-xl font-black text-emerald-700">{accountStats.verified}</p>
                            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Verified</p>
                        </button>

                        {/* Verification Pending */}
                        <button
                            onClick={() => navigateTo('accounts')}
                            className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md hover:border-amber-200 transition-all duration-200 p-2 md:p-3 text-center group cursor-pointer"
                        >
                            
                            <p className="text-lg md:text-xl font-black text-amber-700">{accountStats.pending}</p>
                            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Pending</p>
                        </button>

                        {/* Ignored */}
                        <button
                            onClick={() => navigateTo('accounts')}
                            className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 p-2 md:p-3 text-center group cursor-pointer"
                        >
                            
                            <p className="text-lg md:text-xl font-black text-slate-600">{accountStats.ignored}</p>
                            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Ignored</p>
                        </button>
                    </div>
                )}
            </section>

            {/* ══════════════════════════════════════════════════════════════
               SECTION 2: Follow-ups
               ══════════════════════════════════════════════════════════════ */}
            <section>
                <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-base font-black text-slate-800 tracking-tight">Follow-ups</h3>
                </div>

                {loadingFollowUps ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                        {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">

                        {/* Active */}
                        <button
                            onClick={() => navigateTo('followups')}
                            className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200 p-2 md:p-3 text-center group cursor-pointer"
                        >
                            
                            <p className="text-lg md:text-xl font-black text-blue-700">{followUpStats.active}</p>
                            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Active</p>
                        </button>

                        {/* Today */}
                        <button
                            onClick={() => navigateTo('followups')}
                            className={`rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200 p-2 md:p-3 text-center group cursor-pointer ${
                                followUpStats.today > 0 
                                    ? 'bg-gradient-to-br from-indigo-50 to-white border-indigo-200 hover:border-indigo-300' 
                                    : 'bg-white border-slate-200/60 hover:border-indigo-200'
                            }`}
                        >
                            
                            <p className="text-lg md:text-xl font-black text-indigo-700">{followUpStats.today}</p>
                            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Today</p>
                        </button>

                        {/* Overdue */}
                        <button
                            onClick={() => navigateTo('followups')}
                            className={`rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200 p-2 md:p-3 text-center group cursor-pointer ${
                                followUpStats.overdue > 0 
                                    ? 'bg-gradient-to-br from-red-50 to-white border-red-200 hover:border-red-300' 
                                    : 'bg-white border-slate-200/60 hover:border-red-200'
                            }`}
                        >
                            
                            <p className={`text-lg md:text-xl font-black ${followUpStats.overdue > 0 ? 'text-red-700' : 'text-slate-600'}`}>{followUpStats.overdue}</p>
                            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Overdue</p>
                        </button>

                        {/* Upcoming */}
                        <button
                            onClick={() => navigateTo('followups')}
                            className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md hover:border-teal-200 transition-all duration-200 p-2 md:p-3 text-center group cursor-pointer"
                        >
                            
                            <p className="text-lg md:text-xl font-black text-teal-700">{followUpStats.upcoming}</p>
                            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Upcoming</p>
                        </button>
                    </div>
                )}
            </section>

            {/* ══════════════════════════════════════════════════════════════
               SECTION 3: Employee Monthly Pay Report
               ══════════════════════════════════════════════════════════════ */}
            <section>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-red-600" />
                        <h3 className="text-base font-black text-slate-800 tracking-tight">
                            Attendance Report
                        </h3>
                    </div>
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                        {monthDisplay(selectedMonth)}
                    </span>
                </div>

                {loadingEmployees ? (
                    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 animate-pulse">
                        <div className="space-y-3">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="flex justify-between">
                                    <div className="h-4 bg-slate-200 rounded w-40"></div>
                                    <div className="h-4 bg-slate-200 rounded w-24"></div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : monthlySummary.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-8 text-center">
                        <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm font-bold text-slate-500">No attendance data for {monthDisplay(selectedMonth)}</p>
                        <p className="text-xs text-slate-400 mt-1">Attendance records will appear here once marked.</p>
                    </div>
                ) : (
                    <button
                        onClick={() => navigateTo('employee')}
                        className="w-full text-left cursor-pointer group"
                    >
                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 overflow-hidden">

                            {/* Table Header */}
                            <div className="hidden md:grid grid-cols-8 gap-2 px-5 py-3 bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                <div className="col-span-2">Employee</div>
                                <div className="text-center">Present</div>
                                <div className="text-center">Saturday</div>
                                <div className="text-center">Paid Leave</div>
                                <div className="text-center">Unpaid Leave</div>
                                <div className="text-right">Salary</div>
                                <div className="text-right">Payable</div>
                            </div>

                            {/* Employee Rows */}
                            <div className="divide-y divide-slate-100">
                                {monthlySummary.map((emp, idx) => {
                                    const paidDays = emp.present + emp.saturday + emp.paidLeave;
                                    const payable = paidDays * emp.perDaySalary;
                                    return (
                                        <div key={emp.employeeId} className="px-5 py-3 hover:bg-slate-50/50 transition-colors">
                                            {/* Desktop */}
                                            <div className="hidden md:grid grid-cols-8 gap-2 items-center">
                                                <div className="col-span-2 flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold text-xs shrink-0">
                                                        {emp.employeeName?.charAt(0)?.toUpperCase() || '?'}
                                                    </div>
                                                    <span className="text-sm font-bold text-slate-800 truncate">{emp.employeeName}</span>
                                                </div>
                                                <div className="text-center text-sm font-semibold text-emerald-700">{emp.present}</div>
                                                <div className="text-center text-sm font-semibold text-amber-700">{emp.saturday}</div>
                                                <div className="text-center text-sm font-semibold text-blue-700">{emp.paidLeave}</div>
                                                <div className="text-center text-sm font-semibold text-rose-700">{emp.unpaidLeave}</div>
                                                <div className="text-right text-sm font-semibold text-slate-600">{fmtCurrency(emp.monthlySalary)}</div>
                                                <div className="text-right text-sm font-black text-slate-900">{fmtCurrency(payable)}</div>
                                            </div>
                                            {/* Mobile */}
                                            <div className="md:hidden">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold text-[10px] shrink-0">
                                                            {emp.employeeName?.charAt(0)?.toUpperCase() || '?'}
                                                        </div>
                                                        <span className="text-sm font-bold text-slate-800 truncate max-w-[140px]">{emp.employeeName}</span>
                                                    </div>
                                                    <span className="text-sm font-black text-slate-900">{fmtCurrency(payable)}</span>
                                                </div>
                                                <div className="flex gap-2 text-[10px] font-bold flex-wrap">
                                                    <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{emp.present}P</span>
                                                    <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{emp.saturday}S</span>
                                                    <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{emp.paidLeave}PL</span>
                                                    <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">{emp.unpaidLeave}UL</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Total Footer */}
                            <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-slate-800 uppercase tracking-wider">Total Payable</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black text-red-700">{fmtCurrency(totalPayable)}</span>
                                    <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-red-500 transition-colors" />
                                </div>
                            </div>
                        </div>
                    </button>
                )}
            </section>
        </div>
    );
}
