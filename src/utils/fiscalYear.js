import { db } from '../firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

// Fetch all fiscal years from Firestore, sorted by startDate
export async function fetchFiscalYears() {
    try {
        const q = query(collection(db, 'fiscalYears'), orderBy('startDate', 'asc'));
        const snap = await getDocs(q);
        const fys = [];
        snap.forEach(d => fys.push({ id: d.id, ...d.data() }));
        return fys;
    } catch (e) {
        console.error("Error fetching FYs:", e);
        return [];
    }
}

// Get the FY object for the current date (fallback)
export function getCurrentFYObject(fys) {
    if (!fys || fys.length === 0) return null;
    const today = new Date().toISOString().split('T')[0];
    
    // Find the FY where today falls between startDate and endDate
    for (const fy of fys) {
        if (today >= fy.startDate && today <= fy.endDate) {
            return fy;
        }
    }
    // If not found, just return the last one (most recent)
    return fys[fys.length - 1];
}
