/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  Check, 
  X, 
  Clock, 
  Save, 
  Search, 
  Users, 
  AlertCircle, 
  Award,
  CheckCircle2,
  FileSpreadsheet,
  TrendingUp,
  Download,
  Printer,
  Sparkles,
  CloudCheck,
  RefreshCw,
  Filter,
  CheckCircle,
  HelpCircle,
  MessageSquare,
  ShieldCheck,
  CalendarCheck
} from 'lucide-react';
import { Student, StudentClass, AttendanceRecord, AttendanceStatus, StudentAcademicRecord } from '../types';
import { CLASSES_LIST } from '../constants';
import { SCHOOL_INFO } from '../initialData';
import { syncFirestoreCollection, batchSaveToFirestore, saveToFirestore } from '../services/firestoreSync';
import { useAuth } from '../context/AuthContext';
import StudentAttendanceTrendsChart from './StudentAttendanceTrendsChart';
import { motion, AnimatePresence } from 'motion/react';

interface StudentAttendancePanelProps {
  students: Student[];
  records?: StudentAcademicRecord[];
  onNavigate?: (tab: string, arg?: any) => void;
}

export default function StudentAttendancePanel({ 
  students, 
  records = [],
  onNavigate 
}: StudentAttendancePanelProps) {
  const { user, role, can } = useAuth();

  // 1. Current selection states
  const getTodayDateString = () => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  };

  const getYesterdayDateString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [selectedClass, setSelectedClass] = useState<StudentClass>('Primary 6');
  const [searchStudentTerm, setSearchStudentTerm] = useState('');
  const [activeViewTab, setActiveViewTab] = useState<'roll-call' | 'monthly-register' | 'trends'>('roll-call');
  
  // 2. Attendance database state & notes state
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavedMessage, setIsSavedMessage] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Student remarks/notes for excused or explained absences/lateness
  const [studentRemarks, setStudentRemarks] = useState<Record<string, string>>({});

  // 3. Load attendance logs with Cloud Firestore & local cache
  useEffect(() => {
    const unsub = syncFirestoreCollection<AttendanceRecord>(
      'daily_attendance',
      'sma_daily_attendance',
      (records) => {
        setAttendanceRecords(records);
        const now = new Date();
        setLastSyncTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      },
      []
    );

    const handleWiped = () => {
      setAttendanceRecords([]);
    };

    window.addEventListener('sma_database_wiped', handleWiped);

    return () => {
      unsub();
      window.removeEventListener('sma_database_wiped', handleWiped);
    };
  }, []);

  // Current date logging sheet state (holds temporary status changes before saving)
  const [currentLoggingSheet, setCurrentLoggingSheet] = useState<Record<string, AttendanceStatus>>({});

  // Active students in selected class
  const classStudents = useMemo(() => {
    return students.filter(
      s => s.status === 'Active' && s.currentClass === selectedClass
    );
  }, [students, selectedClass]);

  // Sync currentLoggingSheet when selectedDate or selectedClass changes
  useEffect(() => {
    const sheet: Record<string, AttendanceStatus> = {};
    const remarksMap: Record<string, string> = {};

    classStudents.forEach(s => {
      const match = attendanceRecords.find(
        r => r.studentId === s.id && r.date === selectedDate
      );
      // default to 'Present' if no record exists yet
      sheet[s.id] = match ? match.status : 'Present';
      if (match?.remarks) {
        remarksMap[s.id] = match.remarks;
      }
    });

    setCurrentLoggingSheet(sheet);
    setStudentRemarks(remarksMap);
  }, [selectedDate, selectedClass, attendanceRecords, classStudents]);

  // Handle status toggle for a student
  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setCurrentLoggingSheet(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  // Handle remarks change
  const handleRemarkChange = (studentId: string, text: string) => {
    setStudentRemarks(prev => ({
      ...prev,
      [studentId]: text
    }));
  };

  // Mark all as Present shortcut
  const handleMarkAllPresent = () => {
    const updated: Record<string, AttendanceStatus> = {};
    classStudents.forEach(s => {
      updated[s.id] = 'Present';
    });
    setCurrentLoggingSheet(updated);
  };

  // Mark all as Late shortcut
  const handleMarkAllLate = () => {
    const updated: Record<string, AttendanceStatus> = {};
    classStudents.forEach(s => {
      updated[s.id] = 'Late';
    });
    setCurrentLoggingSheet(updated);
  };

  // Save current sheet to Cloud Firestore
  const handleSaveAttendance = async () => {
    setIsSaving(true);
    let updatedRecords = [...attendanceRecords];
    const nowIso = new Date().toISOString();
    const markedBy = user?.displayName || `${role?.toUpperCase()} Educator`;

    classStudents.forEach(student => {
      const targetId = `${student.id}-${selectedDate}`;
      const status = currentLoggingSheet[student.id] || 'Present';
      const remarks = studentRemarks[student.id] || '';

      const recordItem: AttendanceRecord = {
        id: targetId,
        studentId: student.id,
        studentName: student.name,
        admissionNumber: student.admissionNumber,
        currentClass: student.currentClass,
        date: selectedDate,
        status,
        remarks,
        markedBy,
        markedAt: nowIso
      };

      const existingIdx = updatedRecords.findIndex(r => r.id === targetId);
      if (existingIdx > -1) {
        updatedRecords[existingIdx] = recordItem;
      } else {
        updatedRecords.push(recordItem);
      }
    });

    setAttendanceRecords(updatedRecords);
    try {
      localStorage.setItem('sma_daily_attendance', JSON.stringify(updatedRecords));
    } catch {}

    // Persist to Cloud Firestore collection 'daily_attendance'
    await batchSaveToFirestore('daily_attendance', updatedRecords, 'id');
    
    setIsSaving(false);
    setIsSavedMessage(true);
    const now = new Date();
    setLastSyncTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setTimeout(() => setIsSavedMessage(false), 4000);
  };

  // KPI Metrics Calculation for Selected Class on Selected Date
  const currentDailyStats = useMemo(() => {
    const total = classStudents.length;
    if (total === 0) {
      return { total: 0, present: 0, late: 0, absent: 0, rate: 100 };
    }

    let present = 0;
    let late = 0;
    let absent = 0;

    classStudents.forEach(s => {
      const status = currentLoggingSheet[s.id] || 'Present';
      if (status === 'Present') present++;
      else if (status === 'Late') late++;
      else if (status === 'Absent') absent++;
    });

    const rate = Math.round(((present + late) / total) * 100);

    return { total, present, late, absent, rate };
  }, [classStudents, currentLoggingSheet]);

  // Monthly Metrics
  const currentYearMonth = selectedDate.substring(0, 7); // "YYYY-MM"

  const getStudentMonthlyStats = (studentId: string) => {
    const studentRecords = attendanceRecords.filter(
      r => r.studentId === studentId && r.date.startsWith(currentYearMonth)
    );
    
    const totalDays = studentRecords.length;
    if (totalDays === 0) {
      return { percentage: 100, present: 0, absent: 0, late: 0, total: 0 };
    }

    const presentDays = studentRecords.filter(r => r.status === 'Present').length;
    const lateDays = studentRecords.filter(r => r.status === 'Late').length;
    const absentDays = studentRecords.filter(r => r.status === 'Absent').length;

    const percentage = Math.round(((presentDays + lateDays) / totalDays) * 100);

    return {
      percentage,
      present: presentDays,
      absent: absentDays,
      late: lateDays,
      total: totalDays
    };
  };

  // Overall class average attendance rate for the month
  const classAvgPercentage = useMemo(() => {
    const classStatsList = classStudents.map(s => getStudentMonthlyStats(s.id));
    const validStats = classStatsList.filter(st => st.total > 0);
    return validStats.length > 0 
      ? Math.round(validStats.reduce((acc, curr) => acc + curr.percentage, 0) / validStats.length)
      : 96;
  }, [classStudents, attendanceRecords, currentYearMonth]);

  // Filter searched students
  const searchedClassStudents = useMemo(() => {
    return classStudents.filter(s =>
      s.name.toLowerCase().includes(searchStudentTerm.toLowerCase()) ||
      s.admissionNumber.toLowerCase().includes(searchStudentTerm.toLowerCase())
    );
  }, [classStudents, searchStudentTerm]);

  // Format month name
  const formattedMonthName = useMemo(() => {
    const [year, month] = currentYearMonth.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString('default', { month: 'long', year: 'numeric' });
  }, [currentYearMonth]);

  // Export Daily Attendance Sheet to CSV
  const handleExportCSV = () => {
    if (classStudents.length === 0) return;

    const headers = ['Admission Number', 'Student Name', 'Class', 'Date', 'Status', 'Remarks', 'School'];
    const rows = classStudents.map(s => [
      `"${s.admissionNumber}"`,
      `"${s.name}"`,
      `"${s.currentClass}"`,
      `"${selectedDate}"`,
      `"${currentLoggingSheet[s.id] || 'Present'}"`,
      `"${studentRemarks[s.id] || 'Normal attendance'}"`,
      `"${SCHOOL_INFO.name}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Daily_Attendance_${selectedClass.replace(/\s+/g, '_')}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Daily Attendance Sheet
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6" id="daily-attendance-module">
      
      {/* 1. MODULE BANNER & HEADER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Cloud Firestore Active</span>
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/10 text-slate-300 border border-white/10">
                Term 3 • 2025/2026 Academic Session
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Kambia 1 Campus
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <CalendarCheck className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400 shrink-0" />
              <span>Daily Student Attendance Tracking</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Log daily classroom presence, verify roll-call registers, record excused absences or arrival delays, and sync records permanently to Cloud Firestore.
            </p>
          </div>

          {/* Quick Actions & Sync Status in Banner */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={handleSaveAttendance}
              disabled={isSaving || classStudents.length === 0}
              className="py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black text-xs transition-all shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Saving to Firestore...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-emerald-200" />
                  <span>Save Attendance to Firestore</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCSV}
                title="Export register to CSV"
                className="flex-1 sm:flex-none p-3 rounded-2xl bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white border border-white/10 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span className="sm:hidden">CSV</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                title="Print daily register"
                className="flex-1 sm:flex-none p-3 rounded-2xl bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white border border-white/10 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span className="sm:hidden">Print</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sync Status Banner Bar */}
        {isSavedMessage && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Success: Today's roll call for {selectedClass} has been saved and synchronized with Cloud Firestore!</span>
          </div>
        )}
      </div>

      {/* 2. TOP KPI SUMMARY METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {/* Total Class Strength */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Class Strength</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              {currentDailyStats.total}
            </span>
            <span className="text-[11px] text-slate-400 font-bold block mt-0.5">Enrolled Students</span>
          </div>
        </div>

        {/* Present Count */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-emerald-200/70 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between text-emerald-700 text-xs font-bold">
            <span>Present</span>
            <Check className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono">
                {currentDailyStats.present}
              </span>
              <span className="text-xs font-extrabold text-emerald-600">
                ({currentDailyStats.total > 0 ? Math.round((currentDailyStats.present / currentDailyStats.total) * 100) : 0}%)
              </span>
            </div>
            <span className="text-[11px] text-emerald-600/80 font-bold block mt-0.5">Marked in Classroom</span>
          </div>
        </div>

        {/* Late Count */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-amber-200/70 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between text-amber-700 text-xs font-bold">
            <span>Late Arrivals</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-amber-700 font-mono">
                {currentDailyStats.late}
              </span>
              <span className="text-xs font-extrabold text-amber-600">
                ({currentDailyStats.total > 0 ? Math.round((currentDailyStats.late / currentDailyStats.total) * 100) : 0}%)
              </span>
            </div>
            <span className="text-[11px] text-amber-600/80 font-bold block mt-0.5">Arrived after 8:15 AM</span>
          </div>
        </div>

        {/* Absent Count */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-rose-200/70 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between text-rose-700 text-xs font-bold">
            <span>Absent</span>
            <X className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-rose-700 font-mono">
                {currentDailyStats.absent}
              </span>
              <span className="text-xs font-extrabold text-rose-600">
                ({currentDailyStats.total > 0 ? Math.round((currentDailyStats.absent / currentDailyStats.total) * 100) : 0}%)
              </span>
            </div>
            <span className="text-[11px] text-rose-600/80 font-bold block mt-0.5">Not present</span>
          </div>
        </div>

        {/* Attendance Index Rate */}
        <div className="bg-indigo-50 border border-indigo-200/70 rounded-2xl p-4 sm:p-5 col-span-2 sm:col-span-2 lg:col-span-1 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-indigo-800 text-xs font-bold">
            <span>Class Daily Rate</span>
            <Award className="w-4 h-4 text-indigo-700" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-black text-indigo-900 font-mono">
                {currentDailyStats.rate}%
              </span>
            </div>
            <div className="w-full bg-indigo-200/60 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div 
                className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${currentDailyStats.rate}%` }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. CONTROL BAR: DATE PICKER, GRADE SWITCHER, AND VIEW MODE */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          
          {/* Class Grade Selector */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <span className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>Select Class:</span>
            </span>

            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value as StudentClass)}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              {CLASSES_LIST.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>

          {/* Date Picker Controls with Quick Today/Yesterday */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <span className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>Date:</span>
            </span>

            <button
              type="button"
              onClick={() => setSelectedDate(getTodayDateString())}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedDate === getTodayDateString()
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Today
            </button>

            <button
              type="button"
              onClick={() => setSelectedDate(getYesterdayDateString())}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedDate === getYesterdayDateString()
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Yesterday
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            />
          </div>

          {/* View Mode Switcher Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-stretch lg:self-auto">
            <button
              type="button"
              onClick={() => setActiveViewTab('roll-call')}
              className={`flex-1 lg:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeViewTab === 'roll-call'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Daily Roll Call
            </button>
            <button
              type="button"
              onClick={() => setActiveViewTab('monthly-register')}
              className={`flex-1 lg:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeViewTab === 'monthly-register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Monthly Register
            </button>
            <button
              type="button"
              onClick={() => setActiveViewTab('trends')}
              className={`flex-1 lg:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeViewTab === 'trends'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Trends
            </button>
          </div>
        </div>

        {/* Quick Batch Actions & Search Row */}
        {activeViewTab === 'roll-call' && (
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Filter */}
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchStudentTerm}
                onChange={(e) => setSearchStudentTerm(e.target.value)}
                placeholder={`Search ${classStudents.length} students in ${selectedClass}...`}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder:text-slate-400"
              />
            </div>

            {/* Batch shortcuts */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleMarkAllPresent}
                className="py-1.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Mark All Present</span>
              </button>

              <button
                type="button"
                onClick={handleMarkAllLate}
                className="py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-extrabold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Mark All Late</span>
              </button>

              {lastSyncTime && (
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 ml-1">
                  <CloudCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Cloud Synced ({lastSyncTime})</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. MAIN WORKSPACE VIEW */}
      {activeViewTab === 'roll-call' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-black text-slate-900">
                {selectedClass} Roll Call Register
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Logging for <span className="font-bold text-slate-800">{selectedDate}</span> • {classStudents.length} Students enrolled
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Legend:</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                <Check className="w-3 h-3" /> Present
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                <Clock className="w-3 h-3" /> Late
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                <X className="w-3 h-3" /> Absent
              </span>
            </div>
          </div>

          {/* Students List */}
          <div className="divide-y divide-slate-100">
            {searchedClassStudents.length > 0 ? (
              searchedClassStudents.map((student, idx) => {
                const currentStatus = currentLoggingSheet[student.id] || 'Present';
                const remark = studentRemarks[student.id] || '';
                const monthlyStats = getStudentMonthlyStats(student.id);

                return (
                  <div
                    key={student.id}
                    className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    {/* Student Info */}
                    <div className="flex items-start sm:items-center gap-3.5">
                      <span className="text-xs font-bold text-slate-400 font-mono w-6 text-center shrink-0">
                        {idx + 1}
                      </span>

                      {student.profileImage ? (
                        <img
                          src={student.profileImage}
                          alt={student.name}
                          className="w-11 h-11 rounded-2xl object-cover border border-slate-200 shadow-2xs shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-sm flex items-center justify-center shrink-0 shadow-2xs">
                          {student.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                      )}

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black text-slate-900">{student.name}</h3>
                          {student.stream && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600">
                              {student.stream}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5 font-medium">
                          <span className="font-mono text-slate-600 font-bold">{student.admissionNumber}</span>
                          <span>•</span>
                          <span>Monthly Rate: <strong className={monthlyStats.percentage < 85 ? 'text-rose-600' : 'text-emerald-700'}>{monthlyStats.percentage}%</strong></span>
                          {student.parentPhone && (
                            <>
                              <span>•</span>
                              <span className="text-[11px] text-slate-400">Parent: {student.parentPhone}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status Toggle Buttons & Notes */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      {/* Optional Reason / Notes Input */}
                      <input
                        type="text"
                        value={remark}
                        onChange={(e) => handleRemarkChange(student.id, e.target.value)}
                        placeholder="Remarks / Reason (e.g. Excused, Clinic)..."
                        className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400 text-slate-700 w-full sm:w-56"
                      />

                      {/* 3-State Toggle Pill Buttons */}
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-end sm:self-auto">
                        {/* Present */}
                        <button
                          type="button"
                          onClick={() => handleStatusChange(student.id, 'Present')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                            currentStatus === 'Present'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Present</span>
                        </button>

                        {/* Late */}
                        <button
                          type="button"
                          onClick={() => handleStatusChange(student.id, 'Late')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                            currentStatus === 'Late'
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Late</span>
                        </button>

                        {/* Absent */}
                        <button
                          type="button"
                          onClick={() => handleStatusChange(student.id, 'Absent')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                            currentStatus === 'Absent'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Absent</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <Users className="w-10 h-10 mx-auto text-slate-300" />
                <h3 className="text-base font-bold text-slate-700">No Students Found</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchStudentTerm
                    ? `No students matching "${searchStudentTerm}" in ${selectedClass}.`
                    : `There are currently no active students registered in ${selectedClass}.`}
                </p>
              </div>
            )}
          </div>

          {/* Bottom Save Bar */}
          {searchedClassStudents.length > 0 && (
            <div className="p-4 sm:p-6 bg-slate-50/80 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500 font-medium">
                Showing {searchedClassStudents.length} of {classStudents.length} students in {selectedClass} • Marked for {selectedDate}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleSaveAttendance}
                  disabled={isSaving}
                  className="w-full sm:w-auto py-3 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Saving to Firestore...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 text-white" />
                      <span>Save & Sync Attendance Records</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. MONTHLY REGISTER VIEW */}
      {activeViewTab === 'monthly-register' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-black text-slate-900">
                Monthly Attendance Register & Standings
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Cumulative summary for <strong className="text-slate-800">{formattedMonthName}</strong> in {selectedClass}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500">
                Class Monthly Average: <strong className="text-emerald-700 font-mono text-sm">{classAvgPercentage}%</strong>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Admission No</th>
                  <th className="py-3 px-4 text-center">Days Logged</th>
                  <th className="py-3 px-4 text-center text-emerald-700">Present</th>
                  <th className="py-3 px-4 text-center text-amber-700">Late</th>
                  <th className="py-3 px-4 text-center text-rose-700">Absent</th>
                  <th className="py-3 px-4 text-right">Attendance Rate</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classStudents.map(student => {
                  const stats = getStudentMonthlyStats(student.id);
                  const isPerfect = stats.total > 0 && stats.percentage === 100;
                  const isWarning = stats.total > 0 && stats.percentage < 85;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-black text-slate-900">
                        {student.name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {student.admissionNumber}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-700 font-mono">
                        {stats.total}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-emerald-700 font-mono">
                        {stats.present}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-amber-700 font-mono">
                        {stats.late}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-rose-700 font-mono">
                        {stats.absent}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className={`font-mono font-black ${isWarning ? 'text-rose-600' : (isPerfect ? 'text-emerald-700' : 'text-slate-800')}`}>
                            {stats.percentage}%
                          </span>
                          <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isWarning ? 'bg-rose-500' : (isPerfect ? 'bg-emerald-500' : 'bg-indigo-600')}`}
                              style={{ width: `${stats.percentage}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {isPerfect && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <Award className="w-3 h-3 text-emerald-600" /> Perfect
                          </span>
                        )}
                        {isWarning && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                            <AlertCircle className="w-3 h-3 text-rose-600" /> At Risk
                          </span>
                        )}
                        {!isPerfect && !isWarning && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                            Satisfactory
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. ATTENDANCE TRENDS & ANALYTICS VIEW */}
      {activeViewTab === 'trends' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                <span>Attendance Trajectory & 12-Week Term Trends</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                School-wide attendance progression tracking attendance consistency across Nursery, Primary, JSS, and SSS
              </p>
            </div>
          </div>

          <StudentAttendanceTrendsChart records={records} students={students} />
        </div>
      )}
    </div>
  );
}
