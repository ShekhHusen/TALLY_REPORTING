import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, collectionGroup } from 'firebase/firestore';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';
import EmployeePaySlipModal from './EmployeePaySlipModal';
import {
    Briefcase, CheckCircle2, Clock, AlertTriangle,
    CalendarCheck2, Calendar, AlertCircle, ArrowUpRight,
    Users, IndianRupee, TrendingUp, Eye,
    ShieldCheck, EyeOff, CalendarClock, Flame, Layers, Hourglass
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

/* ── Modern Figma-Standard Stat Card Themes ──────────────────── */
const STAT_CARD_THEMES = {
    emerald: {
        border: 'border-slate-200/80 hover:border-emerald-300',
        topStrip: 'bg-emerald-500',
        iconBox: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
        valueColor: 'text-slate-900 group-hover:text-emerald-700',
        badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
    },
    amber: {
        border: 'border-slate-200/80 hover:border-amber-300',
        topStrip: 'bg-amber-500',
        iconBox: 'bg-amber-50 text-amber-600 border border-amber-100',
        valueColor: 'text-slate-900 group-hover:text-amber-700',
        badge: 'bg-amber-50 text-amber-700 border border-amber-200/80',
    },
    slate: {
        border: 'border-slate-200/80 hover:border-slate-300',
        topStrip: 'bg-slate-400',
        iconBox: 'bg-slate-100 text-slate-600 border border-slate-200',
        valueColor: 'text-slate-900 group-hover:text-slate-700',
        badge: 'bg-slate-100 text-slate-600 border border-slate-200/80',
    },
    blue: {
        border: 'border-slate-200/80 hover:border-blue-300',
        topStrip: 'bg-blue-500',
        iconBox: 'bg-blue-50 text-blue-600 border border-blue-100',
        valueColor: 'text-slate-900 group-hover:text-blue-700',
        badge: 'bg-blue-50 text-blue-700 border border-blue-200/80',
    },
    indigo: {
        border: 'border-slate-200/80 hover:border-indigo-300',
        topStrip: 'bg-indigo-500',
        iconBox: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
        valueColor: 'text-slate-900 group-hover:text-indigo-700',
        badge: 'bg-indigo-50 text-indigo-700 border border-indigo-200/80',
    },
    rose: {
        border: 'border-slate-200/80 hover:border-rose-300',
        topStrip: 'bg-rose-500',
        iconBox: 'bg-rose-50 text-rose-600 border border-rose-100',
        valueColor: 'text-slate-900 group-hover:text-rose-700',
        badge: 'bg-rose-50 text-rose-700 border border-rose-200/80',
    },
    teal: {
        border: 'border-slate-200/80 hover:border-teal-300',
        topStrip: 'bg-teal-500',
        iconBox: 'bg-teal-50 text-teal-600 border border-teal-100',
        valueColor: 'text-slate-900 group-hover:text-teal-700',
        badge: 'bg-teal-50 text-teal-700 border border-teal-200/80',
    },
};

function DashboardStatCard({
    title,
    value,
    badge,
    icon: Icon,
    colorScheme = 'blue',
    onClick,
}) {
    const theme = STAT_CARD_THEMES[colorScheme] || STAT_CARD_THEMES.blue;

    return (
        <button
            type="button"
            onClick={onClick}
            className={`group relative bg-white rounded-2xl border ${theme.border} p-3 sm:p-3.5 text-left shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-between`}
        >
            {/* Top decorative accent strip */}
            <div className={`absolute top-0 left-0 right-0 h-1 ${theme.topStrip}`} />

            {/* Header: Label + Icon */}
            <div className="flex items-center justify-between gap-1.5 pt-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">
                    {title}
                </span>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ${theme.iconBox}`}>
                    <Icon size={14} className="stroke-[2.5]" />
                </div>
            </div>

            {/* Value */}
            <div className="flex items-baseline justify-between gap-1 my-1.5">
                <span className={`text-xl sm:text-2xl font-black tracking-tight ${theme.valueColor} tabular-nums`}>
                    {value}
                </span>
                <ArrowUpRight size={13} className="text-slate-300 group-hover:text-slate-600 transition-colors shrink-0" />
            </div>

            {/* Bottom Badge */}
            {badge && (
                <div className="pt-1.5 border-t border-slate-100/90 flex items-center justify-between">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 ${theme.badge}`}>
                        {badge}
                    </span>
                </div>
            )}
        </button>
    );
}

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

    /* ── Pay slip view modal ─────────────────────────────────────── */
    const [viewingPaySlipSummary, setViewingPaySlipSummary] = useState(null);

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

    const navigateTo = (tabId, params = null) => {
        if (setActiveTab) setActiveTab(tabId, params);
    };

    /* ══════════════════════════════════════════════════════════════
       SKELETON LOADER
       ══════════════════════════════════════════════════════════════ */
    const SkeletonCard = () => (
        <div className="bg-white rounded-2xl border border-slate-200/60 p-3 sm:p-3.5 animate-pulse flex flex-col justify-between h-[112px]">
            <div className="flex items-center justify-between">
                <div className="h-3 bg-slate-200 rounded w-16"></div>
                <div className="w-7 h-7 rounded-lg bg-slate-100"></div>
            </div>
            <div className="h-6 bg-slate-200 rounded w-12 my-1"></div>
            <div className="h-3.5 bg-slate-100 rounded w-20"></div>
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

            {/* ── Account Overview & Follow-ups (1 Row 2 Columns on md and lg) ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 items-start">

                {/* ══════════════════════════════════════════════════════════════
                   SECTION 1: Account Stats
                   ══════════════════════════════════════════════════════════════ */}
                <section>
                    <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-base font-black text-slate-800 tracking-tight">Account Overview</h3>
                    </div>

                    {loadingAccounts ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
                            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
                            <DashboardStatCard
                                title="Accounts"
                                value={accountStats.total}
                                icon={Layers}
                                colorScheme="blue"
                                badge="Total Master"
                                onClick={() => navigateTo('accounts', { verificationStatus: 'all', showIgnored: false })}
                            />
                            <DashboardStatCard
                                title="Verified"
                                value={accountStats.verified}
                                icon={ShieldCheck}
                                colorScheme="emerald"
                                badge="Audited"
                                onClick={() => navigateTo('accounts', { verificationStatus: 'verified', showIgnored: false })}
                            />
                            <DashboardStatCard
                                title="Pending"
                                value={accountStats.pending}
                                icon={Hourglass}
                                colorScheme="amber"
                                badge="Needs Review"
                                onClick={() => navigateTo('accounts', { verificationStatus: 'unverified', showIgnored: false })}
                            />
                            <DashboardStatCard
                                title="Ignored"
                                value={accountStats.ignored}
                                icon={EyeOff}
                                colorScheme="slate"
                                badge="Excluded"
                                onClick={() => navigateTo('accounts', { verificationStatus: 'ignored', showIgnored: true })}
                            />
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
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
                            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
                            <DashboardStatCard
                                title="Active"
                                value={followUpStats.active}
                                icon={CalendarCheck2}
                                colorScheme="blue"
                                badge="Open Tasks"
                                onClick={() => navigateTo('followups', { status: 'Active' })}
                            />
                            <DashboardStatCard
                                title="Due Today"
                                value={followUpStats.today}
                                icon={Calendar}
                                colorScheme="indigo"
                                badge={followUpStats.today > 0 ? 'Action Today' : 'All Clear'}
                                onClick={() => navigateTo('followups', { status: 'Today' })}
                            />
                            <DashboardStatCard
                                title="Overdue"
                                value={followUpStats.overdue}
                                icon={Flame}
                                colorScheme={followUpStats.overdue > 0 ? 'rose' : 'slate'}
                                badge={followUpStats.overdue > 0 ? 'Attention' : 'No Overdue'}
                                onClick={() => navigateTo('followups', { status: 'Overdue' })}
                            />
                            <DashboardStatCard
                                title="Upcoming"
                                value={followUpStats.upcoming}
                                icon={CalendarClock}
                                colorScheme="teal"
                                badge="Scheduled"
                                onClick={() => navigateTo('followups', { status: 'Upcoming' })}
                            />
                        </div>
                    )}
                </section>
            </div>

            {/* ══════════════════════════════════════════════════════════════
               SECTION 3: Employee Monthly Pay Report
               ══════════════════════════════════════════════════════════════ */}
            <section >
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-red-600" />
                        <h3 className="text-base font-black text-slate-800 tracking-tight">
                            Attendance Report
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                            {monthDisplay(selectedMonth)}
                        </span>
                        <button
                            type="button"
                            onClick={() => navigateTo('employee', { subTab: 'reports' })}
                            className="hidden sm:inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-emerald-700 hover:bg-slate-100 px-2.5 py-1 rounded-full transition-colors cursor-pointer"
                            title="Go to Employee Management"
                        >
                            <span>Employee Tab</span>
                            <ArrowUpRight size={13} />
                        </button>
                    </div>
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
                    <div className="w-full text-left">
                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">

                            {/* Table Header */}
                            <div className="hidden md:grid grid-cols-9 gap-2 px-5 py-3 bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                <div className="col-span-2">Employee</div>
                                <div className="text-center">Present</div>
                                <div className="text-center">Saturday</div>
                                <div className="text-center">Paid Leave</div>
                                <div className="text-center">Unpaid Leave</div>
                                <div className="text-right">Salary</div>
                                <div className="text-right">Payable</div>
                                <div className="text-center">Pay Slip</div>
                            </div>

                            {/* Employee Rows */}
                            <div className="divide-y divide-slate-100">
                                {monthlySummary.map((emp) => {
                                    const paidDays = emp.present + emp.saturday + emp.paidLeave;
                                    const payable = paidDays * emp.perDaySalary;
                                    return (
                                        <div key={emp.employeeId} className="px-5 py-2 hover:bg-slate-50/50 transition-colors">
                                            {/* Desktop */}
                                            <div className="hidden md:grid grid-cols-9 gap-2 items-center">
                                                <div
                                                    onClick={() => setViewingPaySlipSummary(emp)}
                                                    className="col-span-2 flex items-center gap-2.5 cursor-pointer group/emp min-w-0"
                                                    title="Click to view pay slip details"
                                                >
                                                    <div className="w-5 h-5 rounded-full bg-red-100 group-hover/emp:bg-red-200 flex items-center justify-center text-red-700 font-bold text-xs shrink-0 transition-colors shadow-2xs">
                                                        {emp.employeeName?.charAt(0)?.toUpperCase() || '?'}
                                                    </div>
                                                    <div className="truncate">
                                                        <span className="text-sm font-bold text-slate-800 group-hover/emp:text-emerald-700 group-hover/emp:underline truncate transition-colors flex items-center gap-1.5">
                                                            <span className="truncate">{emp.employeeName}</span>
                                                            <Eye size={12} className="opacity-0 group-hover/emp:opacity-100 text-emerald-600 transition-opacity shrink-0" />
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-center text-sm font-semibold text-emerald-700">{emp.present}</div>
                                                <div className="text-center text-sm font-semibold text-amber-700">{emp.saturday}</div>
                                                <div className="text-center text-sm font-semibold text-blue-700">{emp.paidLeave}</div>
                                                <div className="text-center text-sm font-semibold text-rose-700">{emp.unpaidLeave}</div>
                                                <div className="text-right text-sm font-semibold text-slate-600">{fmtCurrency(emp.monthlySalary)}</div>
                                                <div className="text-right text-sm font-black text-slate-900">{fmtCurrency(payable)}</div>
                                                <div className="text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => setViewingPaySlipSummary(emp)}
                                                        className="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                                                        title="View Pay Slip Details"
                                                    >
                                                        <Eye size={13} className="stroke-[2.5]" />
                                                        <span>View</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Mobile */}
                                            <div className="md:hidden">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div
                                                        onClick={() => setViewingPaySlipSummary(emp)}
                                                        className="flex items-center gap-2 cursor-pointer group/emp min-w-0"
                                                        title="Click to view pay slip details"
                                                    >
                                                        <div className="w-7 h-7 rounded-full bg-red-100 group-hover/emp:bg-red-200 flex items-center justify-center text-red-700 font-bold text-[10px] shrink-0 transition-colors">
                                                            {emp.employeeName?.charAt(0)?.toUpperCase() || '?'}
                                                        </div>
                                                        <span className="text-sm font-bold text-slate-800 group-hover/emp:text-emerald-700 group-hover/emp:underline truncate max-w-[130px] flex items-center gap-1">
                                                            <span>{emp.employeeName}</span>
                                                            <Eye size={11} className="text-slate-400 group-hover/emp:text-emerald-600 shrink-0" />
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-black text-slate-900">{fmtCurrency(payable)}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setViewingPaySlipSummary(emp)}
                                                            className="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                                                            title="View Pay Slip Details"
                                                        >
                                                            <Eye size={12} className="stroke-[2.5]" />
                                                            <span>View</span>
                                                        </button>
                                                    </div>
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
                                <div className="flex items-center gap-3">
                                    <span className="text-lg font-black text-red-700">{fmtCurrency(totalPayable)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* ── Pay Slip View Modal ── */}
            <EmployeePaySlipModal
                isOpen={Boolean(viewingPaySlipSummary)}
                onClose={() => setViewingPaySlipSummary(null)}
                empSummary={viewingPaySlipSummary}
                employee={viewingPaySlipSummary ? employees.find(e => e.id === viewingPaySlipSummary.employeeId) : null}
                selectedMonth={selectedMonth}
                attendanceRecords={attendanceRecords}
            />
        </div>
    );
}
