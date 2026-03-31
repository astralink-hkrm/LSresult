'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';

interface Student {
  id: number;
  rollNo: string;
  name?: string;
  mobile?: string;
  status?: 'pending' | 'fetching' | 'success' | 'error' | 'saved';
  result?: ResultData;
  error?: string;
}

interface ResultData {
  candidateName: string;
  fatherName: string;
  motherName: string;
  schoolName: string;
  rollNumber: string;
  subjects: Subject[];
  totalMarks: string;
  resultDivision: string;
  percentage: string;
}

interface Subject {
  name: string;
  total: string;
}

interface ResultResponse {
  rollNo: string;
  candidateName: string;
  fatherName: string;
  motherName: string;
  schoolName: string;
  subjects: Subject[];
  totalMarks: string;
  resultDivision: string;
  percentage: string;
  mobile?: string;
}

export default function RajasthanPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [stream, setStream] = useState<'science' | 'arts'>('science');
  const [isFetchingAll, setIsFetchingAll] = useState(false);
  const shouldStopRef = useRef(false);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchRollNo, setSearchRollNo] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set([
    'S.No', 'Name', 'Roll No', 'Mobile', 'Total', '%', 'Result', 'Action'
  ]));
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [...prev, `[${timestamp}] ${msg}`]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    addLog(`File selected: ${file.name}`);

    const reader = new FileReader();
    reader.onload = (event) => {
      addLog('Parsing Excel file...');
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      const findColumnValue = (row: Record<string, unknown>, patterns: string[]): string => {
        for (const key of Object.keys(row)) {
          const lowerKey = key.toLowerCase().trim();
          for (const pattern of patterns) {
            const lowerPattern = pattern.toLowerCase().trim();
            if (lowerKey.includes(lowerPattern) || lowerPattern.includes(lowerKey)) {
              const val = String(row[key] ?? '').trim();
              if (val) return val;
            }
          }
        }
        return '';
      };

      const parsedStudents: Student[] = jsonData.map((row: unknown, idx): Student => {
        const r = row as Record<string, unknown>;
        return {
          id: Date.now() + idx,
          rollNo: findColumnValue(r, ['roll no', 'rollno', 'roll number', 'roll']).replace(/\D/g, ''),
          name: findColumnValue(r, ['name', 'student']),
          mobile: findColumnValue(r, ['mobile', 'phone']),
          status: 'pending' as const,
        };
      }).filter((s): s is Student => s.rollNo !== '');

      addLog(`Parsed ${parsedStudents.length} students`);
      setStudents(parsedStudents);
      setSelectedIds(new Set(parsedStudents.map(s => s.id)));
    };
    reader.readAsArrayBuffer(file);
  };

  const parseResultHtml = (html: string): ResultData | null => {
    try {
      const cleanText = (s: string): string => 
        s.replace(/<[^>]+>/g, '')
         .replace(/&nbsp;/g, ' ')
         .replace(/\r?\n/g, ' ')
         .replace(/\s+/g, ' ')
         .trim();

      // Candidate Info
      const nameMatch = html.match(/Examinee Name[\s\S]*?<td[^>]*?>[\s\S]*?:[\s]*&nbsp;([\s\S]*?)<\/font>/i);
      const candidateName = nameMatch ? cleanText(nameMatch[1]) : '';

      const fatherMatch = html.match(/Father's Name[\s\S]*?<td[^>]*?>[\s\S]*?:[\s]*&nbsp;([\s\S]*?)<\/font>/i);
      const fatherName = fatherMatch ? cleanText(fatherMatch[1]) : '';

      const motherMatch = html.match(/Mother's Name[\s\S]*?<td[^>]*?>[\s\S]*?:[\s]*&nbsp;([\s\S]*?)<\/font>/i);
      const motherName = motherMatch ? cleanText(motherMatch[1]) : '';

      // Roll No and School
      const rollSchoolMatch = html.match(/Roll No\.[\s\S]*?School[\s\S]*?<\/tr>[\s\S]*?<tr>[\s\S]*?<td[^>]*?>[\s\S]*?<font[^>]*?>([\s\S]*?)<\/font>[\s\S]*?<\/td>[\s\S]*?<td[^>]*?>[\s\S]*?<font[^>]*?>([\s\S]*?)<\/font>[\s\S]*?<\/td>/i);
      const rollNumber = rollSchoolMatch ? cleanText(rollSchoolMatch[1]) : '';
      const schoolName = rollSchoolMatch ? cleanText(rollSchoolMatch[2]) : '';

      // Subjects
      const subjects: Subject[] = [];
      const subjectRowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*height="22"[^>]*>[\s\S]*?<font[^>]*?>&nbsp;([\s\S]*?)<\/font>[\s\S]*?<\/td>([\s\S]*?)<\/tr>/gi;
      let match;
      while ((match = subjectRowRegex.exec(html)) !== null) {
        const subjectName = cleanText(match[1]);
        const cellsContent = match[2];
        const cellMatches = cellsContent.match(/<td[^>]*?>[\s\S]*?<font[^>]*?>([\s\S]*?)<\/font>/gi);
        if (cellMatches && cellMatches.length > 0) {
          const lastCell = cellMatches[cellMatches.length - 1];
          const totalMarks = cleanText(lastCell);
          subjects.push({ name: subjectName, total: totalMarks });
        }
      }

      // Summary
      const totalMarksMatch = html.match(/Total marks obtain:&nbsp;\s*([\s\S]*?)<\/strong>/i);
      const totalMarks = totalMarksMatch ? cleanText(totalMarksMatch[1]) : '';

      const percentageMatch = html.match(/Percentage:&nbsp;\s*([\s\S]*?)<\/strong>/i);
      const percentage = percentageMatch ? cleanText(percentageMatch[1]) : '';

      const resultMatch = html.match(/Result:&nbsp;([\s\S]*?)<\/strong>/i);
      const resultDivision = resultMatch ? cleanText(resultMatch[1]) : '';

      return {
        candidateName,
        fatherName,
        motherName,
        schoolName,
        rollNumber,
        subjects,
        totalMarks,
        resultDivision,
        percentage,
      };
    } catch (error) {
      addLog(`Error parsing HTML: ${error}`);
      return null;
    }
  };

  const fetchResult = async (student: Student) => {
    addLog(`Fetching result for roll: ${student.rollNo}`);
    setStudents(prev =>
      prev.map(s => (s.id === student.id ? { ...s, status: 'fetching' } : s))
    );

    try {
      const res = await fetch('/api/rajasthan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNo: student.rollNo, stream, mobile: student.mobile }),
      });

      const data = await res.json();
      if (data.success && data.html) {
        const resultData = parseResultHtml(data.html);
        if (resultData) {
          setStudents(prev =>
            prev.map(s =>
              s.id === student.id
                ? { ...s, status: 'success', result: resultData }
                : s
            )
          );
          if (data.saved) {
            addLog(`Success & Saved: ${resultData.candidateName}`);
          } else {
            addLog(`Success (DB unavailable): ${resultData.candidateName}`);
          }
          return true;
        } else {
          throw new Error('Parsing failed');
        }
      } else {
        throw new Error(data.error || 'Failed to fetch');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Error';
      addLog(`Error for ${student.rollNo}: ${errMsg}`);
      setStudents(prev =>
        prev.map(s =>
          s.id === student.id ? { ...s, status: 'error', error: errMsg } : s
        )
      );
      return false;
    }
  };

  const fetchAllResults = async () => {
    if (isFetchingAll) return;
    setIsFetchingAll(true);
    shouldStopRef.current = false;
    addLog('Starting batch fetch with 2s delay...');
    
    const pendingStudents = students.filter(s => s.status !== 'success' && selectedIds.has(s.id));
    
    for (let i = 0; i < pendingStudents.length; i++) {
      if (shouldStopRef.current) {
        addLog('Fetch process stopped by user.');
        break;
      }

      await fetchResult(pendingStudents[i]);
      
      if (i < pendingStudents.length - 1 && !shouldStopRef.current) {
        addLog(`Waiting 2 seconds before next request (${i + 1}/${pendingStudents.length})...`);
        for (let j = 0; j < 20; j++) {
          if (shouldStopRef.current) break;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    
    setIsFetchingAll(false);
    shouldStopRef.current = false;
    addLog('Batch fetch process finished.');
  };

  const handleFetchSavedData = async () => {
    addLog(`Fetching saved data for ${stream}...`);
    try {
      const res = await fetch(`/api/rajasthan?stream=${stream}`);
      const data = await res.json();
      
      if (data.results && data.results.length > 0) {
        const savedStudents: Student[] = data.results.map((r: ResultResponse, idx: number): Student => ({
          id: Date.now() + idx,
          rollNo: r.rollNo,
          name: r.candidateName,
          mobile: r.mobile,
          status: 'success',
          result: {
            candidateName: r.candidateName,
            fatherName: r.fatherName,
            motherName: r.motherName,
            schoolName: r.schoolName,
            rollNumber: r.rollNo,
            subjects: r.subjects || [],
            totalMarks: r.totalMarks,
            resultDivision: r.resultDivision,
            percentage: r.percentage,
          }
        }));
        setStudents(savedStudents);
        setSelectedIds(new Set(savedStudents.map(s => s.id)));
        addLog(`Loaded ${savedStudents.length} saved results from database.`);
      } else if (data.error && data.error.includes('unavailable')) {
        addLog(`Database unavailable - please check MongoDB Atlas connection`);
      } else {
        addLog(`No saved results found in database`);
      }
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : 'Failed to fetch saved data'}`);
    }
  };

  const handleStopFetch = () => {
    shouldStopRef.current = true;
    addLog('Stopping... please wait for current request to finish.');
  };

  const handleClearData = async () => {
    if (confirm('Are you sure you want to clear all data from database and screen? This cannot be undone.')) {
      try {
        await fetch(`/api/rajasthan?stream=${stream}`, { method: 'DELETE' });
        setStudents([]);
        setSelectedIds(new Set());
        setLogMessages([]);
        addLog('All data cleared from database and screen.');
      } catch (error) {
        addLog('Failed to clear data from database.');
      }
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === students.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map(s => s.id)));
    }
  };

  const toggleSelectRow = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSearchSingle = async () => {
    if (!searchRollNo) return;
    const tempStudent: Student = {
      id: Date.now(),
      rollNo: searchRollNo,
      status: 'pending',
    };
    setStudents(prev => [tempStudent, ...prev]);
    setSelectedIds(prev => new Set(prev).add(tempStudent.id));
    setShowSearchModal(false);
    setSearchRollNo('');
    await fetchResult(tempStudent);
  };

  const exportToExcel = () => {
    addLog('Exporting to Excel...');
    const fetched = students.filter(s => s.status === 'success' && s.result && selectedIds.has(s.id));
    if (fetched.length === 0) {
      addLog('No successful results selected for export.');
      return;
    }

    const allSubjectNamesSet = new Set<string>();
    fetched.forEach(s => s.result?.subjects.forEach(sub => allSubjectNamesSet.add(sub.name)));
    const subjectList = Array.from(allSubjectNamesSet);

    const exportData = fetched.map(s => {
      const r = s.result!;
      const row: Record<string, string | number> = {
        'S.No': s.id,
        'Name': s.name || r.candidateName,
        'Roll No': r.rollNumber,
        'Mobile': s.mobile || '-',
        'Total Marks': r.totalMarks,
        'Percentage': r.percentage,
        'Result': r.resultDivision,
      };
      subjectList.forEach(subName => {
        const sub = r.subjects.find(sub => sub.name === subName);
        row[subName] = sub ? sub.total : '-';
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, `Rajasthan_12th_${stream}_Results.xlsx`);
  };

  const allSubjectNames = Array.from(
    new Set(
      students
        .filter(s => s.status === 'success' && s.result)
        .flatMap(s => s.result?.subjects.map(sub => sub.name) || [])
    )
  );

  const toggleColumn = (col: string) => {
    const newCols = new Set(visibleColumns);
    if (newCols.has(col)) {
      newCols.delete(col);
    } else {
      newCols.add(col);
    }
    setVisibleColumns(newCols);
  };


  const successCount = students.filter(s => s.status === 'success').length;
  const errorCount = students.filter(s => s.status === 'error').length;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-full mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block">
              ← Back to Home
            </Link>
            <h1 className="text-2xl font-bold text-orange-600">
              Rajasthan Board 12th Result 2026
            </h1>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6 sticky top-0 z-30">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setStream('science')}
                className={`px-4 py-2 rounded-md font-medium transition-all ${
                  stream === 'science' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Science
              </button>
              <button
                onClick={() => setStream('arts')}
                className={`px-4 py-2 rounded-md font-medium transition-all ${
                  stream === 'arts' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Arts
              </button>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} ref={fileInputRef} className="hidden" />
              <span className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
                Excel Upload
              </span>
            </label>

            <button
              onClick={() => setShowSearchModal(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm"
            >
              Get Single Result
            </button>

            <button
              onClick={handleFetchSavedData}
              className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 font-medium text-sm"
            >
              Fetch Saved Data
            </button>

            {students.length > 0 && (
              <>
                {!isFetchingAll ? (
                  <button
                    onClick={fetchAllResults}
                    disabled={selectedIds.size === 0}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
                  >
                    Fetch All ({selectedIds.size} selected)
                  </button>
                ) : (
                  <button
                    onClick={handleStopFetch}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm animate-pulse"
                  >
                    Stop Fetching
                  </button>
                )}
                
                <button
                  onClick={handleClearData}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium text-sm"
                >
                  Clear All Data
                </button>
              </>
            )}

            <div className="relative">
              <button
                onClick={() => setShowColumnFilter(!showColumnFilter)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm"
              >
                Columns Filter
              </button>
              {showColumnFilter && (
                <div className="absolute top-full mt-2 bg-white border rounded-lg shadow-xl p-4 z-40 w-48 max-h-64 overflow-y-auto">
                  <div className="flex flex-col gap-2">
                    {['S.No', 'Name', 'Roll No', 'Mobile', 'Total', '%', 'Result', 'Action', ...allSubjectNames].map(col => (
                      <label key={col} className="flex items-center gap-2 text-xs font-medium cursor-pointer hover:bg-gray-50 p-1">
                        <input
                          type="checkbox"
                          checked={visibleColumns.has(col)}
                          onChange={() => toggleColumn(col)}
                          className="w-3 h-3"
                        />
                        {col}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={exportToExcel}
              disabled={successCount === 0}
              className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium text-sm"
            >
              Export Excel
            </button>
          </div>

          {students.length > 0 && (
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-xs">
              <div className="bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
                <span className="font-semibold text-gray-700">Total:</span> {students.length}
              </div>
              <div className="bg-blue-50 px-3 py-1.5 rounded-lg text-blue-700 border border-blue-100">
                <span className="font-semibold">Selected:</span> {selectedIds.size}
              </div>
              <div className="bg-green-50 px-3 py-1.5 rounded-lg text-green-700 border border-green-100">
                <span className="font-semibold">Success:</span> {successCount}
              </div>
              <div className="bg-red-50 px-3 py-1.5 rounded-lg text-red-700 border border-red-100">
                <span className="font-semibold">Error:</span> {errorCount}
              </div>
            </div>
          )}
        </div>

        {showSearchModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Search Single Result</h2>
                <button onClick={() => setShowSearchModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
              </div>
              <input
                type="text"
                value={searchRollNo}
                onChange={(e) => setSearchRollNo(e.target.value)}
                placeholder="Enter Roll Number"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg mb-4 text-center text-lg focus:border-blue-500 outline-none"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSingle()}
              />
              <div className="flex gap-3">
                <button onClick={() => setShowSearchModal(false)} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg font-medium">Cancel</button>
                <button onClick={handleSearchSingle} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">Search</button>
              </div>
            </div>
          </div>
        )}

        {logMessages.length > 0 && (
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg mb-6 font-mono text-[10px] max-h-32 overflow-y-auto shadow-inner border border-gray-800">
            {logMessages.map((msg, idx) => (
              <div key={idx} className="mb-0.5 opacity-80">{msg}</div>
            ))}
          </div>
        )}

        {students.length > 0 && (
          <div className="bg-white rounded-lg shadow-xl overflow-hidden border border-gray-200">
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-sm text-left border-collapse table-auto relative">
                <thead className="bg-gray-800 text-white uppercase text-[10px] tracking-wider sticky top-0 z-20">
                  <tr>
                    <th className="px-3 py-4 border-r border-gray-700 text-center sticky left-0 z-30 bg-gray-800 w-12">
                      <input type="checkbox" checked={selectedIds.size === students.length && students.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded" />
                    </th>
                    {visibleColumns.has('S.No') && (
                      <th className="px-4 py-4 border-r border-gray-700 text-center sticky left-12 z-30 bg-gray-800 w-16">S.No</th>
                    )}
                    {visibleColumns.has('Name') && (
                      <th className="px-4 py-4 border-r border-gray-700 sticky left-[112px] z-30 bg-gray-800 min-w-[150px]">Name</th>
                    )}
                    {visibleColumns.has('Roll No') && (
                      <th className="px-4 py-4 border-r border-gray-700 min-w-[120px]">Roll No</th>
                    )}
                    {visibleColumns.has('Mobile') && (
                      <th className="px-4 py-4 border-r border-gray-700 min-w-[120px]">Mobile</th>
                    )}
                    
                    {allSubjectNames.map((subName, i) => visibleColumns.has(subName) && (
                      <th key={i} className="px-4 py-4 border-r border-gray-700 bg-blue-900 text-center min-w-[100px]">
                        {subName}
                      </th>
                    ))}
                    
                    {visibleColumns.has('Total') && (
                      <th className="px-4 py-4 border-r border-gray-700 bg-orange-700 text-center min-w-[100px]">Total</th>
                    )}
                    {visibleColumns.has('%') && (
                      <th className="px-4 py-4 border-r border-gray-700 bg-purple-700 text-center min-w-[80px]">%</th>
                    )}
                    {visibleColumns.has('Result') && (
                      <th className="px-4 py-4 border-r border-gray-700 min-w-[120px]">Result</th>
                    )}
                    {visibleColumns.has('Action') && (
                      <th className="px-4 py-4 text-center sticky right-0 bg-gray-800 z-30 w-24 border-l border-gray-700">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {students.map((student, idx) => (
                    <tr key={student.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                      <td className="px-3 py-3 border-r border-gray-100 text-center sticky left-0 z-10 bg-inherit">
                        <input type="checkbox" checked={selectedIds.has(student.id)} onChange={() => toggleSelectRow(student.id)} className="w-4 h-4 rounded" />
                      </td>
                      {visibleColumns.has('S.No') && (
                        <td className="px-4 py-3 border-r border-gray-100 text-center font-mono text-gray-400 sticky left-12 z-10 bg-inherit">{idx + 1}</td>
                      )}
                      {visibleColumns.has('Name') && (
                        <td className="px-4 py-3 border-r border-gray-100 font-medium sticky left-[112px] z-10 bg-inherit whitespace-nowrap overflow-hidden text-ellipsis">
                          {student.result?.candidateName || student.name || '-'}
                        </td>
                      )}
                      {visibleColumns.has('Roll No') && (
                        <td className="px-4 py-3 border-r border-gray-100 font-mono text-blue-600 font-semibold">{student.rollNo}</td>
                      )}
                      {visibleColumns.has('Mobile') && (
                        <td className="px-4 py-3 border-r border-gray-100 text-gray-600 font-mono text-xs">{student.mobile || '-'}</td>
                      )}
                      
                      {allSubjectNames.map((subName, i) => visibleColumns.has(subName) && (
                        <td key={i} className="px-4 py-3 border-r border-gray-100 text-center font-mono font-medium">
                          {student.result?.subjects.find(s => s.name === subName)?.total || '-'}
                        </td>
                      ))}
                      
                      {visibleColumns.has('Total') && (
                        <td className="px-4 py-3 border-r border-gray-100 text-center font-bold bg-orange-50/50 text-orange-800">
                          {student.result?.totalMarks || '-'}
                        </td>
                      )}
                      {visibleColumns.has('%') && (
                        <td className="px-4 py-3 border-r border-gray-100 text-center font-bold bg-purple-50/50 text-purple-800">
                          {student.result?.percentage || '-'}
                        </td>
                      )}
                      {visibleColumns.has('Result') && (
                        <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            {student.status === 'success' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800 text-center border border-green-200">
                                {student.result?.resultDivision || 'PASSED'}
                              </span>
                            ) : student.status === 'fetching' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 text-center animate-pulse border border-blue-200">
                                FETCHING
                              </span>
                            ) : student.status === 'error' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 text-center border border-red-200" title={student.error}>
                                FAILED
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-800 text-center border border-gray-200">
                                PENDING
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.has('Action') && (
                        <td className="px-4 py-3 text-center sticky right-0 bg-inherit z-10 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] border-l border-gray-100">
                          <button
                            onClick={() => fetchResult(student)}
                            disabled={student.status === 'fetching' || student.status === 'success'}
                            className="px-3 py-1 bg-blue-500 text-white rounded text-[10px] font-bold uppercase hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {student.status === 'success' ? 'OK' : 'Get'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
