import React, { useMemo, useEffect } from 'react';
import { X, Download, Printer, FileText, CheckCircle2 } from 'lucide-react';

/* ── Attendance Color Definitions (matches PDF) ──────────────────── */
const TYPE_COLORS = {
    'Present': { bg: '#c6efce', text: '#14532d', border: '#86efac' },
    'Saturday': { bg: '#ffedb3', text: '#78350f', border: '#fde047' },
    'Paid Leave': { bg: '#c6defe', text: '#1e3a8a', border: '#93c5fd' },
    'Unpaid Leave': { bg: '#fecaca', text: '#7f1d1d', border: '#fca5a5' },
};

const fmtCurrency = (n) => 'Rs.' + Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const monthDisplay = (m) => {
    if (!m) return '';
    const [y, mo] = m.split('-');
    return new Date(+y, +mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

export default function EmployeePaySlipModal({
    isOpen,
    onClose,
    empSummary,
    employee,
    selectedMonth,
    attendanceRecords = [],
    onDownloadPdf,
}) {
    /* ── Close on Escape key ─────────────────────────────────────── */
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    /* ── Build Calendar Data ─────────────────────────────────────── */
    const { calendarGrid, dayNames } = useMemo(() => {
        if (!isOpen || !empSummary || !selectedMonth) {
            return { calendarGrid: [], dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
        }

        const dateTypeMap = {};
        attendanceRecords
            .filter(r => r.employeeId === empSummary.employeeId && r.month === selectedMonth)
            .forEach(r => { dateTypeMap[r.date] = r.type; });

        const [calYear, calMonth] = selectedMonth.split('-').map(Number);
        const daysInMonth = new Date(calYear, calMonth, 0).getDate();
        const firstDayOfWeek = new Date(calYear, calMonth - 1, 1).getDay(); // 0 = Sun

        const days = [];
        // Empty cells before day 1
        for (let i = 0; i < firstDayOfWeek; i++) {
            days.push({ day: null, type: null, dateStr: '' });
        }
        // Actual days
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            days.push({
                day,
                type: dateTypeMap[dateStr] || null,
                dateStr
            });
        }
        // Pad the rest of the week if needed
        while (days.length % 7 !== 0) {
            days.push({ day: null, type: null, dateStr: '' });
        }

        return {
            calendarGrid: days,
            dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        };
    }, [isOpen, selectedMonth, attendanceRecords, empSummary]);

    if (!isOpen || !empSummary) return null;

    const emp = employee || {
        employeeNo: '-',
        name: empSummary.employeeName,
        designation: '-',
        contactNo: '-',
        address: '-',
        joinDate: '-',
        status: 'Active',
        monthlySalary: empSummary.monthlySalary || 0,
        perDaySalary: empSummary.perDaySalary || 0,
    };

    const payableDays = empSummary.present + empSummary.saturday + empSummary.paidLeave;
    const payableAmount = (emp.perDaySalary || empSummary.perDaySalary || 0) * payableDays;
    const monthName = monthDisplay(selectedMonth);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="relative w-full max-w-3xl my-auto bg-slate-100 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-black/10 max-h-[92vh]">

                {/* ── Modal Control Bar (Top) ────────────────────── */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-900 text-white shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white shadow-xs">
                            <FileText size={16} className="stroke-[2.5]" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-extrabold text-sm sm:text-base tracking-tight text-white">
                                    Pay Slip Details
                                </h3>
                                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    View Only
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-medium">
                                {emp.name} • {monthName}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {onDownloadPdf && (
                            <button
                                onClick={onDownloadPdf}
                                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                                title="Download Pay Slip PDF"
                            >
                                <Download size={13} className="stroke-[2.5]" />
                                <span className="hidden sm:inline">Download PDF</span>
                            </button>
                        )}
                        <button
                            onClick={handlePrint}
                            className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-700"
                            title="Print Pay Slip"
                        >
                            <Printer size={13} />
                            <span className="hidden sm:inline">Print</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer ml-1"
                            title="Close (Esc)"
                        >
                            <X size={18} className="stroke-[2.5]" />
                        </button>
                    </div>
                </div>

                {/* ── Scrollable Document Sheet ──────────────────── */}
                <div className="overflow-y-auto p-3 sm:p-6 bg-slate-200/70 flex justify-center flex-1">
                    <div className="bg-white shadow-xl border border-slate-200/90 rounded-xl w-full max-w-2xl p-5 sm:p-7 flex flex-col text-slate-800 font-sans print:shadow-none print:border-none print:p-0">

                        {/* ── Header Banner (Red) ── */}
                        <div className="bg-[#dc2626] text-white rounded-lg p-4 sm:p-5 text-center shadow-xs">
                            <h1 className="text-lg sm:text-2xl font-black uppercase tracking-wider">
                                JAY BAUDHIMAI TRADERS
                            </h1>
                            <p className="text-xs sm:text-sm font-semibold tracking-wide text-white/95 mt-0.5">
                                Monthly Pay Slip
                            </p>
                            <p className="text-[11px] sm:text-xs font-medium text-white/90 mt-0.5">
                                {monthName}
                            </p>
                        </div>

                        {/* ── Section: Employee Details ── */}
                        <div className="mt-5">
                            <div className="border-b-2 border-[#dc2626] pb-1 flex items-center justify-between">
                                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
                                    Employee Details
                                </span>
                                <span className="text-[11px] font-bold text-slate-400">
                                    ID: {emp.employeeNo || '-'}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 py-3 text-xs">
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="font-bold text-slate-500">Employee No:</span>
                                    <span className="font-semibold text-slate-900">{emp.employeeNo || '-'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="font-bold text-slate-500">Name:</span>
                                    <span className="font-bold text-slate-900">{emp.name}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="font-bold text-slate-500">Designation:</span>
                                    <span className="font-semibold text-slate-900">{emp.designation || '-'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="font-bold text-slate-500">Contact:</span>
                                    <span className="font-semibold text-slate-900">{emp.contactNo || '-'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="font-bold text-slate-500">Address:</span>
                                    <span className="font-semibold text-slate-900 max-w-[200px] text-right truncate">{emp.address || '-'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="font-bold text-slate-500">Join Date:</span>
                                    <span className="font-semibold text-slate-900">{emp.joinDate || '-'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-100 sm:col-span-2">
                                    <span className="font-bold text-slate-500">Status:</span>
                                    <span className="font-bold px-2 py-0.5 rounded text-[10px] uppercase bg-emerald-100 text-emerald-800">
                                        {emp.status || 'Active'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* ── Section: Side-by-Side (Attendance Summary & Salary Calculation) ── */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">

                            {/* Left: Attendance Summary */}
                            <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col">
                                <div className="bg-[#dc2626] text-white px-3 py-2 text-xs font-black uppercase tracking-wider flex justify-between items-center">
                                    <span>Attendance Summary</span>
                                    <span className="text-[10px] font-bold text-white/90">Days</span>
                                </div>
                                <div className="divide-y divide-slate-100 text-xs flex-1 bg-white">
                                    <div className="flex justify-between px-3 py-2">
                                        <span className="font-medium text-slate-600 flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#c6efce] border border-[#86efac]" />
                                            Present
                                        </span>
                                        <span className="font-bold text-emerald-800">{empSummary.present}</span>
                                    </div>
                                    <div className="flex justify-between px-3 py-2">
                                        <span className="font-medium text-slate-600 flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#ffedb3] border border-[#fde047]" />
                                            Saturday
                                        </span>
                                        <span className="font-bold text-amber-800">{empSummary.saturday}</span>
                                    </div>
                                    <div className="flex justify-between px-3 py-2">
                                        <span className="font-medium text-slate-600 flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#c6defe] border border-[#93c5fd]" />
                                            Paid Leave
                                        </span>
                                        <span className="font-bold text-blue-800">{empSummary.paidLeave}</span>
                                    </div>
                                    <div className="flex justify-between px-3 py-2">
                                        <span className="font-medium text-slate-600 flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#fecaca] border border-[#fca5a5]" />
                                            Unpaid Leave
                                        </span>
                                        <span className="font-bold text-rose-800">{empSummary.unpaidLeave}</span>
                                    </div>
                                    <div className="flex justify-between px-3 py-2 bg-slate-50 font-black text-slate-900 border-t border-slate-200">
                                        <span>Total Payable</span>
                                        <span className="text-emerald-700 font-extrabold">{payableDays}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Salary Calculation */}
                            <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col">
                                <div className="bg-[#dc2626] text-white px-3 py-2 text-xs font-black uppercase tracking-wider flex justify-between items-center">
                                    <span>Salary Calculation</span>
                                    <span className="text-[10px] font-bold text-white/90">Amount</span>
                                </div>
                                <div className="divide-y divide-slate-100 text-xs flex-1 bg-white">
                                    <div className="flex justify-between px-3 py-2">
                                        <span className="font-medium text-slate-600">Monthly Salary</span>
                                        <span className="font-bold text-slate-900">{fmtCurrency(emp.monthlySalary)}</span>
                                    </div>
                                    <div className="flex justify-between px-3 py-2">
                                        <span className="font-medium text-slate-600">Per Day (Salary / 30)</span>
                                        <span className="font-bold text-slate-900">{fmtCurrency(emp.perDaySalary)}</span>
                                    </div>
                                    <div className="flex justify-between px-3 py-2">
                                        <span className="font-medium text-slate-600">Payable Days</span>
                                        <span className="font-bold text-slate-900">{payableDays}</span>
                                    </div>
                                    <div className="flex justify-between px-3 py-2 bg-slate-50/50">
                                        <span className="font-medium text-slate-500 text-[11px]">Formula: Per Day × Payable Days</span>
                                        <span className="text-[11px] text-slate-400">Standard</span>
                                    </div>
                                    <div className="flex justify-between px-3 py-2 bg-emerald-50/60 font-black text-emerald-900 border-t border-emerald-200">
                                        <span>Calculated Salary</span>
                                        <span className="text-emerald-800">{fmtCurrency(payableAmount)}</span>
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* ── Section: Net Payable Amount Banner ── */}
                        <div className="mt-4 border-2 border-[#dc2626] bg-red-50/50 rounded-lg p-3 sm:p-4 flex items-center justify-between shadow-2xs">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-[#dc2626] shrink-0" />
                                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#dc2626]">
                                    Net Payable Amount
                                </span>
                            </div>
                            <span className="text-lg sm:text-2xl font-black text-[#dc2626] tracking-tight">
                                {fmtCurrency(payableAmount)}
                            </span>
                        </div>

                        {/* ── Section: Attendance Calendar ── */}
                        <div className="mt-5">
                            <div className="border-b-2 border-[#dc2626] pb-1 text-center mb-3">
                                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
                                    Attendance Calendar
                                </span>
                            </div>

                            {/* Calendar Grid */}
                            <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-100">
                                {/* Day Names Header */}
                                <div className="grid grid-cols-7 text-center bg-slate-200 border-b border-slate-300 text-[11px] font-black text-slate-600 py-1.5 uppercase">
                                    {dayNames.map(d => (
                                        <div key={d}>{d}</div>
                                    ))}
                                </div>

                                {/* Date Cells */}
                                <div className="grid grid-cols-7 gap-[1px] bg-slate-200">
                                    {calendarGrid.map((item, idx) => {
                                        if (!item.day) {
                                            return (
                                                <div
                                                    key={`empty-${idx}`}
                                                    className="bg-slate-50 h-9 sm:h-11 flex items-center justify-center opacity-40"
                                                />
                                            );
                                        }

                                        const style = item.type && TYPE_COLORS[item.type]
                                            ? {
                                                backgroundColor: TYPE_COLORS[item.type].bg,
                                                color: TYPE_COLORS[item.type].text,
                                            }
                                            : {
                                                backgroundColor: '#ffffff',
                                                color: '#334155',
                                            };

                                        return (
                                            <div
                                                key={`day-${item.day}`}
                                                style={style}
                                                className="h-9 sm:h-11 flex flex-col items-center justify-center relative transition-colors font-semibold"
                                                title={item.type ? `${item.dateStr}: ${item.type}` : `${item.dateStr}: Unmarked`}
                                            >
                                                <span className="text-xs sm:text-sm font-bold">{item.day}</span>
                                                {item.type && (
                                                    <span className="text-[8px] sm:text-[9px] font-extrabold uppercase leading-none opacity-85 scale-90 sm:scale-100">
                                                        {item.type === 'Paid Leave' ? 'PL' : item.type === 'Unpaid Leave' ? 'UL' : item.type === 'Saturday' ? 'Sat' : 'P'}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Calendar Legend */}
                            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mt-3 text-[11px] font-bold text-slate-700">
                                {Object.entries(TYPE_COLORS).map(([type, color]) => (
                                    <div key={type} className="flex items-center gap-1.5">
                                        <span
                                            className="w-3.5 h-3.5 rounded-sm border"
                                            style={{ backgroundColor: color.bg, borderColor: color.border }}
                                        />
                                        <span>{type}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ── Section: Document Footer ── */}
                        <div className="mt-8 pt-4 border-t border-slate-200 text-center space-y-1">
                            <p className="text-[11px] text-slate-400">
                                Generated on: {new Date().toLocaleDateString('en-IN')}
                            </p>
                            <p className="text-[11px] italic text-slate-400 font-medium">
                                This is a computer-generated pay slip and does not require a signature.
                            </p>
                        </div>

                    </div>
                </div>

                {/* ── Modal Control Bar (Bottom) ─────────────────── */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-white border-t border-slate-200 shrink-0">
                    <div className="text-xs text-slate-500 font-medium hidden sm:block">
                        Press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px]">Esc</kbd> or click outside to close.
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-slate-200 bg-white text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-xs text-xs sm:text-sm cursor-pointer"
                        >
                            Close
                        </button>
                        {onDownloadPdf && (
                            <button
                                type="button"
                                onClick={onDownloadPdf}
                                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                            >
                                <Download size={14} className="stroke-[2.5]" />
                                <span>Download PDF</span>
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
