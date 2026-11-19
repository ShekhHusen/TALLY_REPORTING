import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const monthDisplay = (m) => {
    if (!m) return '';
    const [y, mo] = m.split('-');
    return new Date(+y, +mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const fmtCurrency = (n) => 'Rs.' + Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

/**
 * Generates and downloads a Pay Slip PDF for an employee
 */
export function generatePaySlipPdf({
    empSummary,
    employee,
    employees = [],
    selectedMonth,
    attendanceRecords = []
}) {
    if (!empSummary) return false;

    const emp = employee || employees.find(e => e.id === empSummary.employeeId) || {
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
            ['Status', emp.status || 'Active'],
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

    const [calYear, calMonth] = (selectedMonth || '').split('-').map(Number);
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

    d.save(`PaySlip_${(emp.name || 'Employee').replace(/\s+/g, '_')}_${selectedMonth}.pdf`);
    return true;
}
