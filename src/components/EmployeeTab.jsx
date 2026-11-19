import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import EmployeePaySlipModal from './EmployeePaySlipModal';
import {
    Users, UserPlus, X, Pencil, Trash2, Search, Check, AlertCircle,
    CalendarCheck2, FileText, Plus, Download, Phone, MapPin, BadgeCheck,
    IndianRupee, Calendar, Hash, Link2, Eye
} from 'lucide-react';

/* ── Constants ──────────────────────────────────────────────────────── */
const ATTENDANCE_TYPES = ['Present', 'Saturday', 'Paid Leave', 'Unpaid Leave'];
const EMPLOYEE_STATUSES = ['Intern', 'Active', 'Retired', 'Resigned'];

const STATUS_COLORS = {
    Active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Intern: 'bg-blue-100 text-blue-700 border-blue-200',
    Retired: 'bg-slate-200 text-slate-600 border-slate-300',
    Resigned: 'bg-rose-100 text-rose-700 border-rose-200',
};
const ATT_COLORS = {
    Present: 'bg-emerald-100 text-emerald-700',
    Saturday: 'bg-amber-100 text-amber-700',
    'Paid Leave': 'bg-blue-100 text-blue-700',
    'Unpaid Leave': 'bg-rose-100 text-rose-700',
};

const currentMonthStr = () => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};
const todayStr = () => new Date().toISOString().split('T')[0];
const monthDisplay = (m) => {
    if (!m) return '';
    const [y, mo] = m.split('-');
    return new Date(+y, +mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
const fmtCurrency = (n) => 'Rs.' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── Component ──────────────────────────────────────────────────────── */
export default function EmployeeTab({ currentUser, navigationParams }) {

    /* ── Role checks ─────────────────────────────────────────────── */
    const isSuperAdmin = Boolean(currentUser?.role === 'admin' && currentUser?.adminType !== 'secondary');
    const isSecondaryAdmin = Boolean(currentUser?.role === 'secondary_admin' || (currentUser?.role === 'admin' && currentUser?.adminType === 'secondary'));
    const isAdmin = isSuperAdmin || isSecondaryAdmin;

    /* ── Sub-tab state ───────────────────────────────────────────── */
    const [activeSubTab, setActiveSubTab] = useState(() => navigationParams?.subTab || (isAdmin ? 'employees' : 'attendance'));

    /* ── Employee state ──────────────────────────────────────────── */
    const [employees, setEmployees] = useState([]);
    const [loadingEmployees, setLoadingEmployees] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    /* ── Employee form modal ─────────────────────────────────────── */
    const [showEmployeeModal, setShowEmployeeModal] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [empForm, setEmpForm] = useState({
        employeeNo: '', name: '', address: '', contactNo: '',
        designation: '', joinDate: '', monthlySalary: '',
        status: 'Active', linkedUserId: ''
    });
    const [savingEmployee, setSavingEmployee] = useState(false);

    /* ── Delete confirmation ─────────────────────────────────────── */
    const [employeeToDelete, setEmployeeToDelete] = useState(null);
    const [deletingEmployee, setDeletingEmployee] = useState(false);

    /* ── Attendance state ────────────────────────────────────────── */
    const [attendanceRecords, setAttendanceRecords] = useState([]);
    const [loadingAttendance, setLoadingAttendance] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(() => navigationParams?.month || currentMonthStr());

    /* ── Sync navigation parameters when navigating from external tabs ─ */
    useEffect(() => {
        if (navigationParams?.subTab) {
            setActiveSubTab(navigationParams.subTab);
        }
        if (navigationParams?.month) {
            setSelectedMonth(navigationParams.month);
        }
    }, [navigationParams]);

    /* ── New Attendance modal ────────────────────────────────────── */
    const [showAttendanceModal, setShowAttendanceModal] = useState(false);
    const [attendanceDate, setAttendanceDate] = useState(todayStr);
    const [attendanceEntries, setAttendanceEntries] = useState([]);
    const [savingAttendance, setSavingAttendance] = useState(false);

    /* ── Pay slip view modal ─────────────────────────────────────── */
    const [viewingPaySlipSummary, setViewingPaySlipSummary] = useState(null);

    /* ── Self-view for employee users ────────────────────────────── */
    const [linkedEmployee, setLinkedEmployee] = useState(null);
    const isEmployeeView = !isAdmin && linkedEmployee !== null;

    /* ── Users list for linking ───────────────────────────────────── */
    const [usersList, setUsersList] = useState([]);

    /* ── Toast ────────────────────────────────────────────────────── */
    const [toast, setToast] = useState(null);
    useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);

    /* ── Sub-tab configuration ───────────────────────────────────── */
    const subTabs = isAdmin
        ? [
            { id: 'employees', label: 'Employee', icon: Users },
            { id: 'attendance', label: 'Attendance History', icon: CalendarCheck2 },
            { id: 'reports', label: 'Reports', icon: FileText },
        ]
        : [
            { id: 'attendance', label: 'Attendance History', icon: CalendarCheck2 },
            { id: 'reports', label: 'Reports', icon: FileText },
        ];

    /* ══════════════════════════════════════════════════════════════
       DATA FETCHING
       ══════════════════════════════════════════════════════════════ */

    // Fetch employees
    useEffect(() => {
        const fetchEmployees = async () => {
            setLoadingEmployees(true);
            try {
                const snap = await getDocs(collection(db, 'employees'));
                const list = [];
                snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                setEmployees(list);
            } catch (err) {
                console.error('Failed to fetch employees:', err);
            } finally {
                setLoadingEmployees(false);
            }
        };
        fetchEmployees();
    }, []);

    // Fetch users list for linking (admin only)
    useEffect(() => {
        if (!isAdmin) return;
        const fetchUsers = async () => {
            try {
                const snap = await getDocs(collection(db, 'users'));
                const usrs = [];
                snap.forEach(d => usrs.push({ id: d.id, ...d.data() }));
                usrs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                setUsersList(usrs);
            } catch (err) { console.error(err); }
        };
        fetchUsers();
    }, [isAdmin]);

    // Check if current non-admin user is linked to an employee
    useEffect(() => {
        if (isAdmin || !currentUser?.uid) return;
        const check = async () => {
            try {
                const snap = await getDocs(collection(db, 'employees'));
                snap.forEach(d => {
                    const data = d.data();
                    if (data.linkedUserId === currentUser.uid) {
                        setLinkedEmployee({ id: d.id, ...data });
                    }
                });
            } catch (err) { console.error(err); }
        };
        check();
    }, [isAdmin, currentUser]);

    // Load attendance records for selected month
    const loadAttendance = useCallback(async (month) => {
        setLoadingAttendance(true);
        try {
            const q = query(collection(db, 'attendance'), where('month', '==', month));
            const snap = await getDocs(q);
            let records = [];
            snap.forEach(d => records.push({ id: d.id, ...d.data() }));

            // Self-view filter
            if (!isAdmin && linkedEmployee) {
                records = records.filter(r => r.employeeId === linkedEmployee.id);
            }

            records.sort((a, b) => b.date.localeCompare(a.date) || (a.employeeName || '').localeCompare(b.employeeName || ''));
            setAttendanceRecords(records);
        } catch (err) {
            console.error('Failed to load attendance:', err);
        } finally {
            setLoadingAttendance(false);
        }
    }, [isAdmin, linkedEmployee]);

    useEffect(() => {
        loadAttendance(selectedMonth);
    }, [selectedMonth, loadAttendance]);

    /* ══════════════════════════════════════════════════════════════
       COMPUTED VALUES
       ══════════════════════════════════════════════════════════════ */

    const filteredEmployees = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return employees;
        return employees.filter(e =>
            (e.name && e.name.toLowerCase().includes(q)) ||
            (e.employeeNo && e.employeeNo.toLowerCase().includes(q)) ||
            (e.designation && e.designation.toLowerCase().includes(q)) ||
            (e.contactNo && e.contactNo.includes(q)) ||
            (e.address && e.address.toLowerCase().includes(q))
        );
    }, [employees, searchQuery]);

    const statusCounts = useMemo(() => ({
        total: employees.length,
        active: employees.filter(e => e.status === 'Active').length,
        intern: employees.filter(e => e.status === 'Intern').length,
        retired: employees.filter(e => e.status === 'Retired').length,
        resigned: employees.filter(e => e.status === 'Resigned').length,
    }), [employees]);

    // Monthly summary per employee (for both attendance and report tabs)
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

    // Total aggregate summary cards
    const totalSummary = useMemo(() => {
        const s = { present: 0, saturday: 0, paidLeave: 0, unpaidLeave: 0 };
        attendanceRecords.forEach(r => {
            if (r.type === 'Present') s.present++;
            else if (r.type === 'Saturday') s.saturday++;
            else if (r.type === 'Paid Leave') s.paidLeave++;
            else if (r.type === 'Unpaid Leave') s.unpaidLeave++;
        });
        s.total = s.present + s.saturday + s.paidLeave + s.unpaidLeave;
        return s;
    }, [attendanceRecords]);

    /* ══════════════════════════════════════════════════════════════
       EMPLOYEE CRUD HANDLERS
       ══════════════════════════════════════════════════════════════ */

    const getNextEmployeeNo = () => {
        if (employees.length === 0) return 'EMP-001';
        const nums = employees
            .map(e => parseInt(e.employeeNo?.replace(/[^0-9]/g, '') || '0'))
            .filter(n => !isNaN(n));
        const max = nums.length > 0 ? Math.max(...nums) : 0;
        return `EMP-${String(max + 1).padStart(3, '0')}`;
    };

    const openAddEmployee = () => {
        setEditingEmployee(null);
        setEmpForm({
            employeeNo: getNextEmployeeNo(), name: '', address: '', contactNo: '',
            designation: '', joinDate: todayStr(), monthlySalary: '',
            status: 'Active', linkedUserId: ''
        });
        setShowEmployeeModal(true);
    };

    const openEditEmployee = (emp) => {
        setEditingEmployee(emp);
        setEmpForm({
            employeeNo: emp.employeeNo || '',
            name: emp.name || '',
            address: emp.address || '',
            contactNo: emp.contactNo || '',
            designation: emp.designation || '',
            joinDate: emp.joinDate || '',
            monthlySalary: emp.monthlySalary?.toString() || '',
            status: emp.status || 'Active',
            linkedUserId: emp.linkedUserId || ''
        });
        setShowEmployeeModal(true);
    };

    const handleSaveEmployee = async () => {
        if (!empForm.name.trim()) {
            setToast({ type: 'error', message: 'Employee name is required.' });
            return;
        }

        setSavingEmployee(true);
        try {
            const monthlySalary = parseFloat(empForm.monthlySalary) || 0;
            const perDaySalary = Math.round((monthlySalary / 30) * 100) / 100;

            if (editingEmployee) {
                const ref = doc(db, 'employees', editingEmployee.id);
                const payload = {
                    employeeNo: empForm.employeeNo.trim(),
                    name: empForm.name.trim(),
                    address: empForm.address.trim(),
                    contactNo: empForm.contactNo.trim(),
                    designation: empForm.designation.trim(),
                    joinDate: empForm.joinDate,
                    monthlySalary, perDaySalary,
                    status: empForm.status,
                    linkedUserId: empForm.linkedUserId || null,
                    updatedAt: new Date().toISOString()
                };
                await updateDoc(ref, payload);
                setEmployees(prev => prev.map(e => e.id === editingEmployee.id ? { ...e, ...payload } : e));
                setToast({ type: 'success', message: `Employee "${empForm.name}" updated successfully!` });
            } else {
                const newId = 'emp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
                const newDoc = {
                    employeeNo: empForm.employeeNo.trim(),
                    name: empForm.name.trim(),
                    address: empForm.address.trim(),
                    contactNo: empForm.contactNo.trim(),
                    designation: empForm.designation.trim(),
                    joinDate: empForm.joinDate,
                    monthlySalary, perDaySalary,
                    status: empForm.status,
                    linkedUserId: empForm.linkedUserId || null,
                    createdAt: new Date().toISOString(),
                    createdBy: currentUser.name
                };
                await setDoc(doc(db, 'employees', newId), newDoc);
                setEmployees(prev => [...prev, { id: newId, ...newDoc }].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
                setToast({ type: 'success', message: `Employee "${empForm.name}" added successfully!` });
            }
            setShowEmployeeModal(false);
        } catch (err) {
            console.error('Failed to save employee:', err);
            setToast({ type: 'error', message: 'Failed to save employee: ' + err.message });
        } finally {
            setSavingEmployee(false);
        }
    };

    const confirmDeleteEmployee = async () => {
        if (!employeeToDelete) return;
        setDeletingEmployee(true);
        try {
            await deleteDoc(doc(db, 'employees', employeeToDelete.id));
            setEmployees(prev => prev.filter(e => e.id !== employeeToDelete.id));
            setEmployeeToDelete(null);
            if (editingEmployee?.id === employeeToDelete.id) setShowEmployeeModal(false);
            setToast({ type: 'success', message: `Employee "${employeeToDelete.name}" deleted.` });
        } catch (err) {
            console.error(err);
            setToast({ type: 'error', message: 'Failed to delete: ' + err.message });
        } finally {
            setDeletingEmployee(false);
        }
    };

    /* ══════════════════════════════════════════════════════════════
       ATTENDANCE HANDLERS
       ══════════════════════════════════════════════════════════════ */

    const openAttendanceModal = async () => {
        const today = todayStr();
        setAttendanceDate(today);

        const activeEmps = employees.filter(e => e.status === 'Active');

        // Pre-populate with existing records for today
        const existingMap = {};
        try {
            const q = query(collection(db, 'attendance'), where('date', '==', today));
            const snap = await getDocs(q);
            snap.forEach(d => { const data = d.data(); existingMap[data.employeeId] = data.type; });
        } catch (err) { console.error(err); }

        setAttendanceEntries(activeEmps.map(emp => ({
            employeeId: emp.id,
            employeeName: emp.name,
            type: existingMap[emp.id] || ''
        })));
        setShowAttendanceModal(true);
    };

    const handleAttendanceDateChange = async (newDate) => {
        setAttendanceDate(newDate);
        const existingMap = {};
        try {
            const q = query(collection(db, 'attendance'), where('date', '==', newDate));
            const snap = await getDocs(q);
            snap.forEach(d => { const data = d.data(); existingMap[data.employeeId] = data.type; });
        } catch (err) { console.error(err); }

        setAttendanceEntries(prev => prev.map(entry => ({
            ...entry,
            type: existingMap[entry.employeeId] || ''
        })));
    };

    const handleSaveAttendance = async () => {
        const entriesToSave = attendanceEntries.filter(e => e.type);
        if (entriesToSave.length === 0) {
            setToast({ type: 'error', message: 'Please select attendance type for at least one employee.' });
            return;
        }

        setSavingAttendance(true);
        try {
            const month = attendanceDate.substring(0, 7);

            for (const entry of entriesToSave) {
                const docId = `${attendanceDate}_${entry.employeeId}`;
                await setDoc(doc(db, 'attendance', docId), {
                    employeeId: entry.employeeId,
                    employeeName: entry.employeeName,
                    date: attendanceDate,
                    month,
                    type: entry.type,
                    markedBy: currentUser.name,
                    markedAt: new Date().toISOString()
                });
            }

            setToast({ type: 'success', message: `Attendance marked for ${entriesToSave.length} employee(s) on ${attendanceDate}` });
            setShowAttendanceModal(false);

            // Refresh if the marked date falls in the currently viewed month
            if (month === selectedMonth) {
                loadAttendance(selectedMonth);
            }
        } catch (err) {
            console.error('Failed to save attendance:', err);
            setToast({ type: 'error', message: 'Failed to save attendance: ' + err.message });
        } finally {
            setSavingAttendance(false);
        }
    };

    /* ══════════════════════════════════════════════════════════════
       PAY SLIP PDF GENERATION
       ══════════════════════════════════════════════════════════════ */

    const generatePaySlip = (empSummary) => {
        const emp = employees.find(e => e.id === empSummary.employeeId);
        if (!emp) { setToast({ type: 'error', message: 'Employee data not found.' }); return; }

        const payableDays = empSummary.present + empSummary.saturday + empSummary.paidLeave;
        const payableAmount = emp.perDaySalary * payableDays;
        const monthName = monthDisplay(selectedMonth);

        const d = new jsPDF();

        // ── Header ──
        d.setFillColor(220, 38, 38);
        d.rect(0, 0, 210, 38, 'F');
        d.setTextColor(255, 255, 255);
        d.setFontSize(20);
        d.setFont('helvetica', 'bold');
        d.text('JAY BAUDHIMAI TRADERS', 105, 16, { align: 'center' });
        d.setFontSize(11);
        d.setFont('helvetica', 'normal');
        d.text('Monthly Pay Slip', 105, 26, { align: 'center' });
        d.setFontSize(9);
        d.text(monthName, 105, 33, { align: 'center' });

        // ── Employee Details ──
        d.setTextColor(0);
        d.setFontSize(11);
        d.setFont('helvetica', 'bold');
        d.text('Employee Details', 20, 50);
        d.setDrawColor(220, 38, 38);
        d.setLineWidth(0.5);
        d.line(20, 52, 190, 52);

        autoTable(d, {
            startY: 56,
            body: [
                ['Employee No', emp.employeeNo || '-'],
                ['Name', emp.name],
                ['Designation', emp.designation || '-'],
                ['Contact', emp.contactNo || '-'],
                ['Address', emp.address || '-'],
                ['Join Date', emp.joinDate || '-'],
                ['Status', emp.status],
            ],
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 } },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45, textColor: [100, 116, 139] }, 1: { cellWidth: 100 } },
            margin: { left: 20, right: 20 },
        });

        // ── Side-by-side: Attendance Summary (left) & Salary Calculation (right) ──
        const sectionY = d.lastAutoTable.finalY + 12;
        d.setFontSize(11);
        d.setFont('helvetica', 'bold');
        d.setTextColor(0);
        d.text('Attendance Summary', 14, sectionY);
        d.text('Salary Calculation', 110, sectionY);
        d.setDrawColor(220, 38, 38);
        d.setLineWidth(0.5);
        d.line(14, sectionY + 2, 102, sectionY + 2);
        d.line(110, sectionY + 2, 196, sectionY + 2);

        const sideBySideStartY = sectionY + 6;

        // Left table — Attendance Summary
        autoTable(d, {
            startY: sideBySideStartY,
            head: [['Type', 'Days']],
            body: [
                ['Present', empSummary.present.toString()],
                ['Saturday', empSummary.saturday.toString()],
                ['Paid Leave', empSummary.paidLeave.toString()],
                ['Unpaid Leave', empSummary.unpaidLeave.toString()],
                ['Total Payable', payableDays.toString()],
            ],
            theme: 'grid',
            headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            styles: { fontSize: 8, cellPadding: 3 },
            columnStyles: { 0: { cellWidth: 58 }, 1: { halign: 'center', cellWidth: 28 } },
            margin: { left: 14, right: 112 },
        });
        const leftFinalY = d.lastAutoTable.finalY;

        // Right table — Salary Calculation
        autoTable(d, {
            startY: sideBySideStartY,
            head: [['Component', 'Amount']],
            body: [
                ['Monthly Salary', fmtCurrency(emp.monthlySalary)],
                ['Per Day (Monthly / 30)', fmtCurrency(emp.perDaySalary)],
                ['Payable Days', payableDays.toString()],
            ],
            theme: 'grid',
            headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            styles: { fontSize: 8, cellPadding: 3 },
            columnStyles: { 0: { cellWidth: 52 }, 1: { halign: 'right', cellWidth: 34 } },
            margin: { left: 110, right: 14 },
        });
        const rightFinalY = d.lastAutoTable.finalY;
        const afterSideBySideY = Math.max(leftFinalY, rightFinalY);

        // ── Net Pay ──
        const netY = afterSideBySideY + 2;
        autoTable(d, {
            startY: netY,
            body: [['NET PAYABLE AMOUNT', fmtCurrency(payableAmount)]],
            theme: 'grid',
            styles: { fontSize: 13, fontStyle: 'bold', cellPadding: 6, textColor: [220, 38, 38] },
            columnStyles: { 0: { cellWidth: 100 }, 1: { halign: 'right', cellWidth: 72 } },
            margin: { left: 14, right: 14 },
        });

        // ── Attendance Calendar ──
        const calTitleY = d.lastAutoTable.finalY + 12;
        d.setFontSize(11);
        d.setFont('helvetica', 'bold');
        d.setTextColor(0);
        d.text('Attendance Calendar', 105, calTitleY, { align: 'center' });
        d.setDrawColor(220, 38, 38);
        d.setLineWidth(0.5);
        d.line(14, calTitleY + 2, 196, calTitleY + 2);

        // Build date→type map for this employee in selected month
        const dateTypeMap = {};
        attendanceRecords
            .filter(r => r.employeeId === empSummary.employeeId && r.month === selectedMonth)
            .forEach(r => { dateTypeMap[r.date] = r.type; });

        const [calYear, calMonth] = selectedMonth.split('-').map(Number);
        const daysInMonth = new Date(calYear, calMonth, 0).getDate();
        const firstDayOfWeek = new Date(calYear, calMonth - 1, 1).getDay(); // 0=Sun

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const cellW = 24;
        const cellH = 14;
        const calStartX = (210 - cellW * 7) / 2; // center on A4
        let calY = calTitleY + 8;

        // Color definitions: [R, G, B]
        const typeColors = {
            'Present': [198, 239, 206],
            'Saturday': [255, 237, 179],
            'Paid Leave': [198, 222, 254],
            'Unpaid Leave': [254, 202, 202],
        };

        // Day name header row
        d.setFontSize(7);
        d.setFont('helvetica', 'bold');
        d.setTextColor(100, 116, 139);
        dayNames.forEach((name, i) => {
            const x = calStartX + i * cellW;
            d.setFillColor(241, 245, 249);
            d.rect(x, calY, cellW, 10, 'FD');
            d.text(name, x + cellW / 2, calY + 7, { align: 'center' });
        });
        calY += 10;

        // Calendar day cells
        d.setFontSize(8);
        d.setFont('helvetica', 'normal');
        let col = firstDayOfWeek;
        let rowY = calY;

        // Draw empty cells before first day
        d.setDrawColor(200, 200, 200);
        for (let ec = 0; ec < firstDayOfWeek; ec++) {
            const x = calStartX + ec * cellW;
            d.setFillColor(250, 250, 250);
            d.rect(x, rowY, cellW, cellH, 'FD');
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const x = calStartX + col * cellW;
            const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const attType = dateTypeMap[dateStr];

            // Cell background
            if (attType && typeColors[attType]) {
                const [r, g, b] = typeColors[attType];
                d.setFillColor(r, g, b);
            } else {
                d.setFillColor(255, 255, 255);
            }
            d.setDrawColor(200, 200, 200);
            d.rect(x, rowY, cellW, cellH, 'FD');

            // Day number
            d.setTextColor(30, 41, 59);
            d.text(day.toString(), x + cellW / 2, rowY + 9, { align: 'center' });

            col++;
            if (col > 6) {
                col = 0;
                rowY += cellH;
            }
        }

        // Fill remaining cells in last row
        if (col > 0) {
            for (let ec = col; ec <= 6; ec++) {
                const x = calStartX + ec * cellW;
                d.setFillColor(250, 250, 250);
                d.setDrawColor(200, 200, 200);
                d.rect(x, rowY, cellW, cellH, 'FD');
            }
            rowY += cellH;
        }

        // Legend
        const legendY = rowY + 6;
        const legendItems = [
            { label: 'Present', color: [198, 239, 206] },
            { label: 'Saturday', color: [255, 237, 179] },
            { label: 'Paid Leave', color: [198, 222, 254] },
            { label: 'Unpaid Leave', color: [254, 202, 202] },
        ];
        const legendTotalW = legendItems.length * 42;
        let legendX = (210 - legendTotalW) / 2;
        d.setFontSize(6.5);
        d.setFont('helvetica', 'normal');
        legendItems.forEach(item => {
            const [r, g, b] = item.color;
            d.setFillColor(r, g, b);
            d.setDrawColor(180, 180, 180);
            d.rect(legendX, legendY, 6, 6, 'FD');
            d.setTextColor(60, 60, 60);
            d.text(item.label, legendX + 8, legendY + 5);
            legendX += 42;
        });

        // ── Footer ──
        const footY = legendY + 16;
        d.setFontSize(8);
        d.setTextColor(150);
        d.setFont('helvetica', 'normal');
        d.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 20, footY);
        d.text('This is a computer-generated pay slip and does not require a signature.', 105, footY + 6, { align: 'center' });

        d.save(`PaySlip_${emp.name.replace(/\s+/g, '_')}_${selectedMonth}.pdf`);
        setToast({ type: 'success', message: `Pay slip downloaded for ${emp.name}` });
    };

    /* ══════════════════════════════════════════════════════════════
       LOADING STATE
       ══════════════════════════════════════════════════════════════ */

    if (loadingEmployees) {
        return (
            <div className="flex-1 flex items-center justify-center p-12 text-sm font-bold text-slate-400 gap-3">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                Loading employee data...
            </div>
        );
    }

    /* ══════════════════════════════════════════════════════════════
       RENDER
       ══════════════════════════════════════════════════════════════ */
    return (
        <div className="flex flex-col min-h-0 flex-1  sm:p-0 gap-4 sm:gap-5 bg-slate-50/50">

            {/* ── TOAST ─────────────────────────────────────────── */}
            {toast && (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-md border text-sm font-bold animate-in fade-in slide-in-from-top-2 duration-200 ${
                    toast.type === 'error'
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                    {toast.type === 'error'
                        ? <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
                        : <Check className="w-5 h-5 shrink-0 text-emerald-600 stroke-[3]" />
                    }
                    <span className="flex-1 text-xs sm:text-sm">{toast.message}</span>
                    <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-black/5">
                        <X size={15} />
                    </button>
                </div>
            )}

            {/* ── HEADER BAR + SUB-TAB NAV ──────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-3 sm:p-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="bg-emerald-50 text-emerald-600 rounded-xl">
                        <Users className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div>
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            Employee Management
                        </h2>
                        <p className="text-xs text-slate-500 font-medium">
                        </p>
                    </div>
                </div>

                {/* Sub-tab pills */}
                <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl text-xs font-bold">
                    {subTabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSubTab(tab.id)}
                                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                                    activeSubTab === tab.id
                                        ? 'bg-white text-emerald-700 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <Icon size={13} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════
                EMPLOYEE SUB-TAB
               ══════════════════════════════════════════════════════ */}
            {activeSubTab === 'employees' && isAdmin && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 flex flex-col flex-1 min-h-0 overflow-hidden">

                    {/* Toolbar: Search + Add */}
                    <div className="p-3 sm:px-6 sm:py-3 border-b border-slate-100 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-3 flex-1">
                            <div className="relative flex-1 max-w-md">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text" value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search employees..."
                                    className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                            <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold">
                                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Active {statusCounts.active}</span>
                                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Intern {statusCounts.intern}</span>
                                <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">Retired {statusCounts.retired}</span>
                                <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">Resigned {statusCounts.resigned}</span>
                            </div>
                        </div>
                        <button
                            onClick={openAddEmployee}
                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm shadow-emerald-200 transition-all cursor-pointer whitespace-nowrap"
                        >
                            <Plus size={15} className="stroke-[2.5]" />
                            <span>Add Employee</span>
                        </button>
                    </div>

                    {/* Employee Table */}
                    <div className="overflow-auto flex-1 p-0">
                        <table className="min-w-full divide-y divide-slate-100 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Emp No</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Name</th>
                                    <th className="hidden lg:table-cell px-4 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Address</th>
                                    <th className="hidden md:table-cell px-4 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Contact</th>
                                    <th className="hidden md:table-cell px-4 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Designation</th>
                                    <th className="hidden lg:table-cell px-4 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Join Date</th>
                                    <th className="px-4 py-3 text-right text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Monthly Salary</th>
                                    <th className="hidden sm:table-cell px-4 py-3 text-right text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Per Day</th>
                                    <th className="px-4 py-3 text-center text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="px-4 py-3 text-right text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-50">
                                {filteredEmployees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-4 py-3 text-xs font-bold text-slate-500">{emp.employeeNo}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-slate-900 text-sm">{emp.name}</div>
                                            {emp.linkedUserId && (
                                                <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold mt-0.5">
                                                    <Link2 size={10} /> Linked
                                                </div>
                                            )}
                                        </td>
                                        <td className="hidden lg:table-cell px-4 py-3 text-xs text-slate-600 font-medium max-w-[180px] truncate">{emp.address || '-'}</td>
                                        <td className="hidden md:table-cell px-4 py-3 text-xs text-slate-600 font-medium">{emp.contactNo || '-'}</td>
                                        <td className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-slate-700">{emp.designation || '-'}</td>
                                        <td className="hidden lg:table-cell px-4 py-3 text-xs text-slate-600 font-medium">{emp.joinDate || '-'}</td>
                                        <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{fmtCurrency(emp.monthlySalary)}</td>
                                        <td className="hidden sm:table-cell px-4 py-3 text-right text-xs font-semibold text-slate-500">{fmtCurrency(emp.perDaySalary)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 inline-flex text-[10px] uppercase tracking-wider font-extrabold rounded-md border ${STATUS_COLORS[emp.status] || 'bg-slate-100 text-slate-600'}`}>
                                                {emp.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => openEditEmployee(emp)}
                                                    className="inline-flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-600 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors gap-1 shadow-2xs cursor-pointer"
                                                    title="Edit"
                                                >
                                                    <Pencil size={13} className="stroke-[2.5]" />
                                                </button>
                                                <button
                                                    onClick={() => setEmployeeToDelete(emp)}
                                                    className="inline-flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredEmployees.length === 0 && (
                                    <tr>
                                        <td colSpan="10" className="text-center py-12 text-slate-500 font-medium">
                                            {employees.length === 0 ? 'No employees added yet. Click "+ Add Employee" to get started.' : 'No matching employees found.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
                ATTENDANCE HISTORY SUB-TAB
               ══════════════════════════════════════════════════════ */}
            {activeSubTab === 'attendance' && (
                <div className="flex flex-col flex-1 min-h-0 gap-4">

                    {/* Month Picker + New Attendance */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
                                <Calendar size={14} className="text-slate-400" />
                                <input
                                    type="month" value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="text-sm font-bold text-slate-900 bg-transparent focus:outline-none"
                                />
                            </div>
                            <span className="text-xs text-slate-500 font-medium">
                                {attendanceRecords.length} records
                            </span>
                        </div>
                        {isAdmin && (
                            <button
                                onClick={openAttendanceModal}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm shadow-emerald-200 transition-all cursor-pointer whitespace-nowrap"
                            >
                                <Plus size={15} className="stroke-[2.5]" />
                                <span>New Attendance</span>
                            </button>
                        )}
                    </div>

                    
                    {/* Daily Records Table */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 flex flex-col flex-1 min-h-0 overflow-hidden">
                        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 bg-white shrink-0">
                            <h3 className="text-sm font-black text-slate-800 tracking-tight">Daily Attendance Records</h3>
                        </div>
                        {loadingAttendance ? (
                            <div className="flex-1 flex items-center justify-center p-8 text-sm font-bold text-slate-400 gap-3">
                                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                Loading...
                            </div>
                        ) : (
                            <div className="overflow-auto flex-1">
                                <table className="min-w-full divide-y divide-slate-100 text-sm">
                                    <thead className="bg-slate-50 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-2.5 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Date</th>
                                            <th className="px-4 py-2.5 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Employee</th>
                                            <th className="px-4 py-2.5 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Type</th>
                                            <th className="hidden sm:table-cell px-4 py-2.5 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Marked By</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {attendanceRecords.map(r => (
                                            <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-2.5 text-xs font-bold text-slate-700">{r.date}</td>
                                                <td className="px-4 py-2.5 font-bold text-slate-900">{r.employeeName}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${ATT_COLORS[r.type] || 'bg-slate-100 text-slate-600'}`}>
                                                        {r.type}
                                                    </span>
                                                </td>
                                                <td className="hidden sm:table-cell px-4 py-2.5 text-xs text-slate-500 font-medium">{r.markedBy}</td>
                                            </tr>
                                        ))}
                                        {attendanceRecords.length === 0 && (
                                            <tr>
                                                <td colSpan="4" className="text-center py-12 text-slate-500 font-medium">
                                                    No attendance records for {monthDisplay(selectedMonth)}.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
                REPORTS SUB-TAB
               ══════════════════════════════════════════════════════ */}
            {activeSubTab === 'reports' && (
                <div className="flex flex-col flex-1 min-h-0 gap-4">

                    {/* Month Picker */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
                            <Calendar size={14} className="text-slate-400" />
                            <input
                                type="month" value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="text-sm font-bold text-slate-900 bg-transparent focus:outline-none"
                            />
                        </div>
                        </div>

                    {/* Report Table */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 flex flex-col flex-1 min-h-0 overflow-hidden">
                        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 bg-white shrink-0">
                            <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
                                
                                Monthly Pay Report — {monthDisplay(selectedMonth)}
                            </h3>
                        </div>

                        {loadingAttendance ? (
                            <div className="flex-1 flex items-center justify-center p-8 text-sm font-bold text-slate-400 gap-3">
                                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                Loading report...
                            </div>
                        ) : (
                            <div className="overflow-auto flex-1">
                                <table className="min-w-full divide-y divide-slate-100 text-sm">
                                    <thead className="bg-slate-50 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Employee</th>
                                            <th className="px-4 py-3 text-center text-[11px] font-extrabold text-emerald-600 uppercase tracking-wider">Present</th>
                                            <th className="hidden sm:table-cell px-4 py-3 text-center text-[11px] font-extrabold text-amber-600 uppercase tracking-wider">Saturday</th>
                                            <th className="hidden sm:table-cell px-4 py-3 text-center text-[11px] font-extrabold text-blue-600 uppercase tracking-wider">Paid Leave</th>
                                            <th className="hidden sm:table-cell px-4 py-3 text-center text-[11px] font-extrabold text-rose-600 uppercase tracking-wider">Unpaid Leave</th>
                                            <th className="px-4 py-3 text-center text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Payable Days</th>
                                            <th className="px-4 py-3 text-right text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Per Day</th>
                                            <th className="px-4 py-3 text-right text-[11px] font-extrabold text-emerald-700 uppercase tracking-wider">Payable Amt</th>
                                            <th className="px-4 py-3 text-center text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Pay Slip</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {monthlySummary.map(s => {
                                            const payableDays = s.present + s.saturday + s.paidLeave;
                                            const payableAmt = s.perDaySalary * payableDays;
                                            return (
                                                <tr key={s.employeeId} className="hover:bg-slate-50/50 transition-colors">
                                                    <td
                                                        className="px-4 py-3 cursor-pointer group"
                                                        onClick={() => setViewingPaySlipSummary(s)}
                                                        title="Click to view pay slip details"
                                                    >
                                                        <div className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors flex items-center gap-1.5">
                                                            <span className="group-hover:underline">{s.employeeName}</span>
                                                            <Eye size={13} className="text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0" />
                                                        </div>
                                                        <div className="text-[10px] text-slate-500 font-medium group-hover:text-slate-600">
                                                            Salary: {fmtCurrency(s.monthlySalary)}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-bold text-emerald-700">{s.present}</td>
                                                    <td className="hidden sm:table-cell px-4 py-3 text-center font-bold text-amber-700">{s.saturday}</td>
                                                    <td className="hidden sm:table-cell px-4 py-3 text-center font-bold text-blue-700">{s.paidLeave}</td>
                                                    <td className="hidden sm:table-cell px-4 py-3 text-center font-bold text-rose-700">{s.unpaidLeave}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-md font-black text-xs">{payableDays}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-xs font-semibold text-slate-500">{fmtCurrency(s.perDaySalary)}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className="text-sm font-black text-emerald-700">{fmtCurrency(payableAmt)}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="inline-flex items-center gap-1.5">
                                                            <button
                                                                onClick={() => setViewingPaySlipSummary(s)}
                                                                className="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                                                                title="View Pay Slip Details"
                                                            >
                                                                <Eye size={13} className="stroke-[2.5]" />
                                                                <span className="hidden sm:inline">View</span>
                                                            </button>
                                                            <button
                                                                onClick={() => generatePaySlip(s)}
                                                                className="inline-flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                                                                title="Download Pay Slip PDF"
                                                            >
                                                                <Download size={13} className="stroke-[2.5]" />
                                                                <span className="hidden sm:inline">PDF</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {monthlySummary.length === 0 && (
                                            <tr>
                                                <td colSpan="9" className="text-center py-12 text-slate-500 font-medium">
                                                    No attendance data for {monthDisplay(selectedMonth)}. Mark attendance first.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                    {monthlySummary.length > 0 && (
                                        <tfoot className="bg-emerald-50/50 border-t-2 border-emerald-200">
                                            <tr>
                                                <td className="px-4 py-3 font-black text-slate-900 text-sm">Total</td>
                                                <td className="px-4 py-3 text-center font-black text-emerald-700">{monthlySummary.reduce((a, s) => a + s.present, 0)}</td>
                                                <td className="hidden sm:table-cell px-4 py-3 text-center font-black text-amber-700">{monthlySummary.reduce((a, s) => a + s.saturday, 0)}</td>
                                                <td className="hidden sm:table-cell px-4 py-3 text-center font-black text-blue-700">{monthlySummary.reduce((a, s) => a + s.paidLeave, 0)}</td>
                                                <td className="hidden sm:table-cell px-4 py-3 text-center font-black text-rose-700">{monthlySummary.reduce((a, s) => a + s.unpaidLeave, 0)}</td>
                                                <td className="px-4 py-3 text-center font-black text-emerald-700">
                                                    {monthlySummary.reduce((a, s) => a + s.present + s.saturday + s.paidLeave, 0)}
                                                </td>
                                                <td className="px-4 py-3" />
                                                <td className="px-4 py-3 text-right">
                                                    <span className="text-sm font-black text-emerald-800">
                                                        {fmtCurrency(monthlySummary.reduce((a, s) => a + (s.perDaySalary * (s.present + s.saturday + s.paidLeave)), 0))}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3" />
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
                ADD / EDIT EMPLOYEE MODAL
               ══════════════════════════════════════════════════════ */}
            {showEmployeeModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-black/5">

                        {/* Header */}
                        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-5 border-b border-slate-100 bg-white shrink-0">
                            <div>
                                <h3 className="font-extrabold text-lg sm:text-xl text-slate-900 tracking-tight">
                                    {editingEmployee ? <>Edit: <span className="text-emerald-600">{editingEmployee.name}</span></> : 'Add New Employee'}
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">
                                    {editingEmployee ? 'Update employee details below.' : 'Fill in employee details. Per-day salary auto-calculates.'}
                                </p>
                            </div>
                            <button onClick={() => setShowEmployeeModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-xl transition-colors shrink-0">
                                <X className="w-5 h-5 stroke-[2.5]" />
                            </button>
                        </div>

                        {/* Form Body */}
                        <div className="p-4 sm:p-6 bg-slate-50/50 overflow-y-auto flex-1 space-y-4">

                            {/* Row 1: Emp No + Name */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Employee No</label>
                                    <input type="text" value={empForm.employeeNo}
                                        onChange={(e) => setEmpForm(p => ({ ...p, employeeNo: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white text-slate-900 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:outline-none focus:border-emerald-500"
                                        placeholder="EMP-001" />
                                </div>
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Employee Name *</label>
                                    <input type="text" value={empForm.name} required
                                        onChange={(e) => setEmpForm(p => ({ ...p, name: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white text-slate-900 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:outline-none focus:border-emerald-500"
                                        placeholder="e.g. Ramesh Kumar" />
                                </div>
                            </div>

                            {/* Row 2: Address */}
                            <div>
                                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Address</label>
                                <input type="text" value={empForm.address}
                                    onChange={(e) => setEmpForm(p => ({ ...p, address: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white text-slate-900 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:outline-none focus:border-emerald-500"
                                    placeholder="e.g. Ward 5, Birgunj" />
                            </div>

                            {/* Row 3: Contact + Designation */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Contact No.</label>
                                    <input type="tel" value={empForm.contactNo}
                                        onChange={(e) => setEmpForm(p => ({ ...p, contactNo: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white text-slate-900 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:outline-none focus:border-emerald-500"
                                        placeholder="e.g. 9812345678" />
                                </div>
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Designation</label>
                                    <input type="text" value={empForm.designation}
                                        onChange={(e) => setEmpForm(p => ({ ...p, designation: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white text-slate-900 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:outline-none focus:border-emerald-500"
                                        placeholder="e.g. Accountant" />
                                </div>
                            </div>

                            {/* Row 4: Join Date + Status */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Join Date</label>
                                    <input type="date" value={empForm.joinDate}
                                        onChange={(e) => setEmpForm(p => ({ ...p, joinDate: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white text-slate-900 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:outline-none focus:border-emerald-500" />
                                </div>
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Status</label>
                                    <select value={empForm.status}
                                        onChange={(e) => setEmpForm(p => ({ ...p, status: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white text-slate-900 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:outline-none focus:border-emerald-500">
                                        {EMPLOYEE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Row 5: Monthly Salary + Per Day (auto) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Monthly Salary (₹)</label>
                                    <input type="number" value={empForm.monthlySalary} min="0" step="100"
                                        onChange={(e) => setEmpForm(p => ({ ...p, monthlySalary: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white text-slate-900 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:outline-none focus:border-emerald-500"
                                        placeholder="e.g. 15000" />
                                </div>
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Per Day Salary (Auto)</label>
                                    <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 flex items-center gap-1.5">
                                        <IndianRupee size={13} className="text-slate-400" />
                                        {empForm.monthlySalary ? (parseFloat(empForm.monthlySalary) / 30).toFixed(2) : '0.00'}
                                        <span className="text-[10px] text-slate-400 font-medium ml-auto">Monthly ÷ 30</span>
                                    </div>
                                </div>
                            </div>

                            {/* Row 6: Link to User Account */}
                            <div className="pt-2 border-t border-slate-200/60">
                                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <Link2 size={13} /> Link to User Account (Optional)
                                </label>
                                <select value={empForm.linkedUserId}
                                    onChange={(e) => setEmpForm(p => ({ ...p, linkedUserId: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white text-slate-900 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:outline-none focus:border-emerald-500">
                                    <option value="">— No Link —</option>
                                    {usersList.map(u => (
                                        <option key={u.id} value={u.id}>{u.name} ({u.customUsername || u.email})</option>
                                    ))}
                                </select>
                                <p className="mt-1.5 text-[11px] font-medium text-slate-500 flex items-center gap-1">
                                    <AlertCircle size={12} /> Linked user can view their own attendance & pay slip when granted Employee tab access.
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 sm:px-6 sm:py-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3 shrink-0">
                            {editingEmployee ? (
                                <button onClick={() => setEmployeeToDelete(editingEmployee)}
                                    className="px-3.5 py-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold transition-colors shadow-2xs text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer">
                                    <Trash2 size={15} /> Delete
                                </button>
                            ) : <div />}
                            <div className="flex items-center gap-2">
                                <button onClick={() => setShowEmployeeModal(false)}
                                    className="px-4 py-2 border border-slate-200 bg-white text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-xs text-sm cursor-pointer">
                                    Cancel
                                </button>
                                <button onClick={handleSaveEmployee} disabled={savingEmployee}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl font-bold shadow-xs disabled:opacity-50 transition-all text-sm flex items-center justify-center min-w-[120px] cursor-pointer">
                                    {savingEmployee ? 'Saving...' : editingEmployee ? 'Save Changes' : 'Add Employee'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
                NEW ATTENDANCE MODAL
               ══════════════════════════════════════════════════════ */}
            {showAttendanceModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-black/5">

                        {/* Header */}
                        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-5 border-b border-slate-100 bg-white shrink-0">
                            <div>
                                <h3 className="font-extrabold text-lg sm:text-xl text-slate-900 tracking-tight flex items-center gap-2">
                                    <CalendarCheck2 size={20} className="text-emerald-600" />
                                    Mark Attendance
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">
                                    Select date and mark attendance for active employees.
                                </p>
                            </div>
                            <button onClick={() => setShowAttendanceModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-xl transition-colors shrink-0">
                                <X className="w-5 h-5 stroke-[2.5]" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-4 sm:p-6 bg-slate-50/50 overflow-y-auto flex-1 space-y-4">

                            {/* Date Picker */}
                            <div>
                                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Attendance Date</label>
                                <input type="date" value={attendanceDate}
                                    onChange={(e) => handleAttendanceDateChange(e.target.value)}
                                    className="w-full sm:w-auto px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold bg-white text-slate-900 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:outline-none focus:border-emerald-500" />
                            </div>

                            {/* Employee Attendance List */}
                            <div>
                                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
                                    Active Employees ({attendanceEntries.length})
                                </label>
                                {attendanceEntries.length === 0 ? (
                                    <div className="text-center py-8 text-sm text-slate-500 font-medium bg-white rounded-xl border border-slate-200">
                                        No active employees found. Add employees first.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {/* Quick action: Mark all as Present */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <button
                                                type="button"
                                                onClick={() => setAttendanceEntries(prev => prev.map(e => ({ ...e, type: 'Present' })))}
                                                className="text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
                                            >
                                                All Present
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setAttendanceEntries(prev => prev.map(e => ({ ...e, type: 'Saturday' })))}
                                                className="text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
                                            >
                                                All Saturday
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setAttendanceEntries(prev => prev.map(e => ({ ...e, type: '' })))}
                                                className="text-[11px] font-bold bg-slate-50 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                                            >
                                                Clear All
                                            </button>
                                        </div>

                                        {attendanceEntries.map((entry, idx) => (
                                            <div key={entry.employeeId}
                                                className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                                                    entry.type
                                                        ? 'bg-white border-emerald-200 shadow-xs'
                                                        : 'bg-white/60 border-slate-200'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                                        entry.type ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                                    }`}>
                                                        {(entry.employeeName || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm font-bold text-slate-900 truncate">{entry.employeeName}</span>
                                                </div>
                                                <select
                                                    value={entry.type}
                                                    onChange={(e) => {
                                                        const newEntries = [...attendanceEntries];
                                                        newEntries[idx] = { ...entry, type: e.target.value };
                                                        setAttendanceEntries(newEntries);
                                                    }}
                                                    className={`px-3 py-1.5 border rounded-xl text-xs font-bold shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:outline-none focus:border-emerald-500 min-w-[140px] ${
                                                        entry.type
                                                            ? 'bg-white border-emerald-300 text-emerald-800'
                                                            : 'bg-slate-50 border-slate-200 text-slate-500'
                                                    }`}
                                                >
                                                    <option value="">— Select —</option>
                                                    {ATTENDANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 sm:px-6 sm:py-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3 shrink-0">
                            <div className="text-xs text-slate-500 font-medium">
                                {attendanceEntries.filter(e => e.type).length} of {attendanceEntries.length} selected
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setShowAttendanceModal(false)}
                                    className="px-4 py-2 border border-slate-200 bg-white text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-xs text-sm cursor-pointer">
                                    Cancel
                                </button>
                                <button onClick={handleSaveAttendance} disabled={savingAttendance}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl font-bold shadow-xs disabled:opacity-50 transition-all text-sm flex items-center justify-center min-w-[160px] cursor-pointer">
                                    {savingAttendance ? 'Saving...' : 'Save Attendance'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
                DELETE EMPLOYEE CONFIRMATION MODAL
               ══════════════════════════════════════════════════════ */}
            {employeeToDelete && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[70] p-4 animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-black/10">
                        <div className="p-6 text-center">
                            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-inner">
                                <Trash2 className="w-7 h-7 stroke-[2.5]" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight mb-2">Delete Employee?</h3>
                            <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4">
                                Are you sure you want to permanently delete <strong className="text-slate-900 font-extrabold">"{employeeToDelete.name}"</strong>?
                            </p>
                            <div className="bg-slate-50 rounded-xl p-3.5 text-left text-xs font-semibold text-slate-600 border border-slate-200/80 space-y-1.5 mb-6">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Emp No:</span>
                                    <span className="text-slate-800 font-bold">{employeeToDelete.employeeNo || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Designation:</span>
                                    <span className="text-slate-800 font-bold">{employeeToDelete.designation || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Status:</span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${STATUS_COLORS[employeeToDelete.status] || 'bg-slate-100 text-slate-600'}`}>
                                        {employeeToDelete.status}
                                    </span>
                                </div>
                                <div className="text-rose-600 font-bold pt-1.5 border-t border-slate-200/60 text-[11px] flex items-center gap-1">
                                    <AlertCircle size={13} className="shrink-0" />
                                    <span>This action is permanent and cannot be undone.</span>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setEmployeeToDelete(null)} disabled={deletingEmployee}
                                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors text-sm cursor-pointer disabled:opacity-50">
                                    Cancel
                                </button>
                                <button type="button" onClick={confirmDeleteEmployee} disabled={deletingEmployee}
                                    className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all shadow-sm text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                                    {deletingEmployee ? (
                                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Deleting...</>
                                    ) : (
                                        <><Trash2 size={16} /> Yes, Delete</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ══════════════════════════════════════════════════════
                PAY SLIP VIEW-ONLY MODAL
               ══════════════════════════════════════════════════════ */}
            <EmployeePaySlipModal
                isOpen={Boolean(viewingPaySlipSummary)}
                onClose={() => setViewingPaySlipSummary(null)}
                empSummary={viewingPaySlipSummary}
                employee={viewingPaySlipSummary ? employees.find(e => e.id === viewingPaySlipSummary.employeeId) : null}
                selectedMonth={selectedMonth}
                attendanceRecords={attendanceRecords}
                onDownloadPdf={viewingPaySlipSummary ? () => generatePaySlip(viewingPaySlipSummary) : undefined}
            />
        </div>
    );
}
