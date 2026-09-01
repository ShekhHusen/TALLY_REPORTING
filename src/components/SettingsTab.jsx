import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

export default function SettingsTab({ currentUser }) {
    const [fiscalYears, setFiscalYears] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [fyName, setFyName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchFiscalYears = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(collection(db, 'fiscalYears'));
            const fys = [];
            snap.forEach(d => fys.push({ id: d.id, ...d.data() }));
            // Sort by start date
            fys.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
            setFiscalYears(fys);
        } catch (error) {
            console.error("Error fetching fiscal years:", error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchFiscalYears();
    }, []);

    const handleCreateFY = async (e) => {
        e.preventDefault();
        if (!fyName || !startDate || !endDate) {
            alert("Please fill all fields.");
            return;
        }
        if (startDate > endDate) {
            alert("Start Date cannot be after End Date.");
            return;
        }

        try {
            setIsSubmitting(true);
            const id = `fy-${startDate.substring(0,4)}-${endDate.substring(0,4)}`;
            const fyData = {
                name: fyName,
                startDate: startDate,
                endDate: endDate,
                createdBy: currentUser.name,
                createdAt: new Date().toISOString()
            };

            await setDoc(doc(db, 'fiscalYears', id), fyData);
            alert("Fiscal Year created successfully!");
            setFyName('');
            setStartDate('');
            setEndDate('');
            fetchFiscalYears();
        } catch (error) {
            console.error("Error creating FY:", error);
            alert("Failed to create Fiscal Year.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteFY = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete ${name}? Make sure no data is actively using this FY.`)) return;
        try {
            await deleteDoc(doc(db, 'fiscalYears', id));
            alert("Fiscal Year deleted.");
            fetchFiscalYears();
        } catch (error) {
            console.error("Error deleting FY:", error);
            alert("Failed to delete Fiscal Year.");
        }
    };

    if (currentUser?.role !== 'admin') {
        return <div className="p-6 text-red-600">Access Denied. Admins only.</div>;
    }

    return (
        <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6 h-[calc(100vh-10rem)]">
            <div className="bg-white rounded-lg shadow border border-gray-200 shrink-0">
                <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                    <h3 className="font-semibold text-lg text-gray-800">System Settings - Manage Fiscal Years</h3>
                </div>
                <div className="p-6">
                    <form onSubmit={handleCreateFY} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">FY Name (e.g., FY 2024-25)</label>
                            <input 
                                type="text" 
                                value={fyName}
                                onChange={(e) => setFyName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                placeholder="FY 2024-25"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                            <input 
                                type="date" 
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                            <input 
                                type="date" 
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                required
                            />
                        </div>
                        <div>
                            <button 
                                type="submit" 
                                disabled={isSubmitting}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium shadow-sm disabled:opacity-50 transition"
                            >
                                {isSubmitting ? 'Saving...' : 'Add Fiscal Year'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow border border-gray-200 flex-1 flex flex-col min-h-0">
                <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg shrink-0">
                    <h4 className="font-medium text-gray-700">Available Fiscal Years</h4>
                </div>
                <div className="overflow-y-auto p-0 flex-1">
                    {loading ? (
                        <div className="p-6 text-center text-gray-500">Loading Fiscal Years...</div>
                    ) : fiscalYears.length === 0 ? (
                        <div className="p-6 text-center text-gray-500">No Fiscal Years created yet.</div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-white sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">FY Name</th>
                                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">From Date</th>
                                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">To Date</th>
                                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Created By</th>
                                    <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {fiscalYears.map(fy => (
                                    <tr key={fy.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-3 font-semibold text-gray-900">{fy.name}</td>
                                        <td className="px-6 py-3 text-gray-600">{fy.startDate}</td>
                                        <td className="px-6 py-3 text-gray-600">{fy.endDate}</td>
                                        <td className="px-6 py-3 text-gray-500 text-xs">{fy.createdBy}</td>
                                        <td className="px-6 py-3 text-right">
                                            <button 
                                                onClick={() => handleDeleteFY(fy.id, fy.name)}
                                                className="text-red-600 hover:text-red-800 font-medium text-xs px-3 py-1 border border-red-200 rounded hover:bg-red-50 transition"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
