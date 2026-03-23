'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';

interface Student {
  id: number;
  rollCode: string;
  rollNo: string;
  name?: string;
  mobile?: string;
  courseName?: string;
  remark?: string;
  status?: 'pending' | 'fetching' | 'success' | 'error';
  result?: ResultData;
  error?: string;
}

interface ResultData {
  bsebUniqueId: string;
  studentName: string;
  fatherName: string;
  schoolName: string;
  rollCode: string;
  rollNumber: string;
  registrationNumber: string;
  faculty: string;
  subjects: Subject[];
  aggregateMarks: string;
  resultDivision: string;
  percentage: number;
}

interface Subject {
  name: string;
  fullMarks: number;
  passMarks: number;
  theory: number;
  practical: number;
  subjectTotal: string;
}

export default function BiharPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [captchaCode, setCaptchaCode] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [cookies, setCookies] = useState<Record<string, string>>({});
  const [captchaInput, setCaptchaInput] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchRollCode, setSearchRollCode] = useState('');
  const [searchRollNo, setSearchRollNo] = useState('');
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [...prev, `[${timestamp}] ${msg}`]);
  };

  const fetchInitialData = async () => {
    setCaptchaLoading(true);
    addLog('Fetching initial data from BSEB...');
    try {
      const res = await fetch('/api/result', { method: 'GET' });
      const data = await res.json();
      if (data.csrfToken) {
        setCaptchaCode(data.captchaCode || '');
        setCsrfToken(data.csrfToken);
        setCookies(data.cookies);
        addLog(`Captcha Code: ${data.captchaCode}`);
        addLog(`CSRF Token received: ${data.csrfToken?.substring(0, 30)}...`);
      } else {
        addLog('Error: No CSRF token received');
      }
    } catch (error) {
      addLog(`Error fetching initial data: ${error}`);
    } finally {
      setCaptchaLoading(false);
    }
  };

  useEffect(() => {
    if (students.length > 0 && !csrfToken) {
      fetchInitialData();
    }
  }, [students.length, csrfToken]);

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

      addLog(`Total rows in Excel: ${jsonData.length}`);
      addLog(`Columns: ${Object.keys(jsonData[0] as object).join(', ')}`);

      const firstRow = jsonData[0] as Record<string, unknown>;
      addLog(`Sample Roll Code values: ${Object.keys(firstRow).map(k => `${k}="${firstRow[k]}"`).join(', ')}`);

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

      const normalizeRollCode = (value: string): string => {
        const num = value.replace(/\D/g, '');
        return num.padStart(5, '0');
      };

      const normalizeRollNo = (value: string): string => {
        const num = value.replace(/\D/g, '');
        return num;
      };

      const parsedStudents: Student[] = jsonData.map((row: unknown, idx): Student => {
        const r = row as Record<string, unknown>;
        const rawRollCode = findColumnValue(r, ['roll code', 'rol code', 'rollcode', 'bihar']);
        const rawRollNo = findColumnValue(r, ['roll no', 'rollno', 'roll number', 'roll']);
        return {
          id: idx,
          rollCode: normalizeRollCode(rawRollCode),
          rollNo: normalizeRollNo(rawRollNo),
          name: findColumnValue(r, ['name', 'student']),
          mobile: findColumnValue(r, ['mobile', 'phone']),
          courseName: findColumnValue(r, ['course']),
          remark: findColumnValue(r, ['remark']),
          status: 'pending' as const,
        };
      }).filter((s): s is Student => (s.rollCode || s.rollNo) !== '');

      addLog(`Raw sample - first row rollCode: "${Object.values(firstRow).find(v => String(v).match(/roll\s*code|rol\s*code/i)) || 'not found'}"`);
      addLog(`Parsed ${parsedStudents.length} students`);
      setStudents(parsedStudents);
    };
    reader.readAsArrayBuffer(file);
  };

  const parseResultHtml = (html: string): ResultData | null => {
    try {
      addLog('Parsing result HTML...');
      const getValue = (pattern: RegExp): string => {
        const match = html.match(pattern);
        return match ? match[1].trim() : '';
      };

      const bsebUniqueId = getValue(/BSEB Unique Id<\/td>\s*<td>([^<]+)/i);
      const studentName = getValue(/Student's Name<\/td>\s*<td>([^<]+)/i);
      const fatherName = getValue(/Father's Name<\/td>\s*<td>([^<]+)/i);
      const schoolName = getValue(/School\/College Name<\/td>\s*<td>([^<]+)/i);
      const rollCode = getValue(/Roll Code<\/td>\s*<td>([^<]+)/i);
      const rollNumber = getValue(/Roll Number<\/td>\s*<td>([^<]+)/i);
      const registrationNumber = getValue(/Registration Number<\/td>\s*<td>([^<]+)/i);
      const faculty = getValue(/Faculty<\/td>\s*<td>([^<]+)/i);

      const subjects: Subject[] = [];
      const subjectRegex = /<tr>\s*<td>([^<]+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>([\d]*)<\/td>\s*<td>[\d]*<\/td>\s*<td>[\d]*<\/td>\s*<td>([^<]+)<\/td>/gi;
      let match;
      while ((match = subjectRegex.exec(html)) !== null) {
        subjects.push({
          name: match[1].trim(),
          fullMarks: parseInt(match[2]),
          passMarks: parseInt(match[3]),
          theory: parseInt(match[4]) || 0,
          practical: match[5] ? parseInt(match[5]) : 0,
          subjectTotal: match[6].trim(),
        });
      }

      const aggregateMarksRaw = getValue(/Aggregate Marks:<\/strong><\/td>\s*<td>([^<]+)/i);
      const resultDivision = getValue(/Result\/Division:<\/strong><\/td>\s*<td>([^<]+)/i);

      const marksMatch = aggregateMarksRaw.match(/(\d+)/);
      const aggregateMarks = marksMatch ? marksMatch[1] : aggregateMarksRaw;
      const percentage = marksMatch ? (parseInt(marksMatch[1]) / 500) * 100 : 0;

      addLog(`Parsed: ${studentName}, Marks: ${aggregateMarks}, Division: ${resultDivision}`);

      return {
        bsebUniqueId,
        studentName,
        fatherName,
        schoolName,
        rollCode,
        rollNumber,
        registrationNumber,
        faculty,
        subjects,
        aggregateMarks,
        resultDivision,
        percentage: Math.round(percentage * 100) / 100,
      };
    } catch (error) {
      addLog(`Error parsing result HTML: ${error}`);
      return null;
    }
  };

  const fetchResult = async (student: Student, captcha: string) => {
    addLog(`Fetching result for: ${student.name || student.rollNo}`);
    addLog(`Roll Code: ${student.rollCode}, Roll No: ${student.rollNo}, Captcha: ${captcha}`);
    setStudents(prev =>
      prev.map(s =>
        s.id === student.id
          ? { ...s, status: 'fetching' }
          : s
      )
    );

    try {
      const res = await fetch('/api/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rollCode: student.rollCode,
          rollNo: student.rollNo,
          captcha,
          csrfToken,
          cookies,
        }),
      });

      const data = await res.json();
      addLog(`API Response: success=${data.success}`);

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
          addLog(`Result fetched successfully for ${resultData.studentName}`);
        } else {
          throw new Error('Failed to parse result');
        }
      } else {
        throw new Error(data.error || 'Invalid captcha');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to fetch';
      addLog(`Error: ${errMsg}`);
      setStudents(prev =>
        prev.map(s =>
          s.id === student.id
            ? { ...s, status: 'error', error: errMsg }
            : s
        )
      );
    }
  };

  const handleGetResult = async (student: Student) => {
    addLog(`Opening captcha modal for: ${student.rollNo}`);
    setSelectedStudent(student);
    setCaptchaInput('');
    setShowModal(true);
    await fetchInitialData();
  };

  const handleSubmitCaptcha = () => {
    if (selectedStudent && captchaInput) {
      fetchResult(selectedStudent, captchaInput);
      setShowModal(false);
      setCaptchaInput('');
    }
  };

  const refreshCaptcha = () => {
    addLog('Refreshing captcha...');
    fetchInitialData();
  };

  const exportToExcel = () => {
    addLog('Exporting to Excel...');
    const exportData = students
      .filter(s => s.status === 'success' && s.result)
      .map(s => {
        const r = s.result!;
        const getSubjectMarks = (name: string): string => {
          const sub = r.subjects.find(subj => 
            subj.name.toLowerCase().includes(name.toLowerCase())
          );
          return sub ? sub.subjectTotal : '-';
        };
        const getAdditionalSubject = (): { name: string; marks: string } => {
          const compulsory = ['eng', 'hin'];
          const elective = ['phy', 'chem', 'math', 'bio'];
          const additional = r.subjects.find(subj => {
            const lowerName = subj.name.toLowerCase();
            return !compulsory.some(c => lowerName.includes(c)) && 
                   !elective.some(e => lowerName.includes(e));
          });
          return additional ? { name: additional.name, marks: additional.subjectTotal } : { name: 'ADD', marks: '-' };
        };
        const additionalSubject = getAdditionalSubject();
        const row: Record<string, string | number> = {
          'S.No': s.id + 1,
          'Name': s.name || r.studentName,
          'Roll Code': r.rollCode,
          'Roll No': r.rollNumber,
          'ENG': getSubjectMarks('eng'),
          'HIN': getSubjectMarks('hin'),
          'PHY': getSubjectMarks('phy'),
          'CHEM': getSubjectMarks('chem'),
          'MATH': getSubjectMarks('math'),
          'BIO': getSubjectMarks('bio'),
          [`ADD (${additionalSubject.name})`]: additionalSubject.marks,
          'Total': r.aggregateMarks,
          '%': r.percentage,
          'Division': r.resultDivision,
        };

        return row;
      });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, 'BSEB_Results.xlsx');
    addLog(`Exported ${exportData.length} results to Excel`);
  };

  const fetchedStudents = students.filter(s => s.status === 'success' && s.result);
  const pendingCount = students.filter(s => s.status === 'pending').length;
  const successCount = students.filter(s => s.status === 'success').length;
  const errorCount = students.filter(s => s.status === 'error').length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block">
              ← Back to Home
            </Link>
            <h1 className="text-2xl font-bold text-red-600">
              Bihar School Examination Board - Result Fetcher
            </h1>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-wrap gap-4 items-center mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                ref={fileInputRef}
                className="hidden"
              />
              <span className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                Upload Excel File
              </span>
            </label>
            <button
              onClick={() => setShowSearchModal(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
            >
              Search Single
            </button>
            {captchaCode && (
              <button
                onClick={refreshCaptcha}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm font-medium"
              >
                Refresh Captcha
              </button>
            )}
          </div>

          {students.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-4">
              <div className="bg-gray-100 px-4 py-2 rounded-lg">
                <span className="font-semibold">Total:</span> {students.length}
              </div>
              <div className="bg-yellow-100 px-4 py-2 rounded-lg">
                <span className="font-semibold">Pending:</span> {pendingCount}
              </div>
              <div className="bg-green-100 px-4 py-2 rounded-lg">
                <span className="font-semibold">Success:</span> {successCount}
              </div>
              <div className="bg-red-100 px-4 py-2 rounded-lg">
                <span className="font-semibold">Error:</span> {errorCount}
              </div>
              <button
                onClick={exportToExcel}
                disabled={fetchedStudents.length === 0}
                className="ml-auto px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                Export to Excel
              </button>
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border-2 border-blue-200">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-900">Enter Captcha</h2>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setCaptchaInput('');
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-3">Roll No: {selectedStudent?.rollNo}</p>
              {captchaLoading ? (
                <div className="text-center py-6">
                  <div className="animate-spin inline-block w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mb-3"></div>
                  <p className="text-gray-600">Loading...</p>
                </div>
              ) : captchaCode ? (
                <div className="mb-4">
                  <div className="bg-blue-100 border-2 border-blue-300 rounded-lg p-5 text-center">
                    <p className="text-sm text-blue-600 mb-2">Enter this code:</p>
                    <p className="text-4xl font-bold tracking-widest text-blue-800">{captchaCode}</p>
                  </div>
                  <button
                    onClick={fetchInitialData}
                    className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline block w-full text-center"
                  >
                    Refresh Captcha
                  </button>
                </div>
              ) : (
                <div className="mb-4 text-center py-6 text-gray-600">
                  <p className="mb-2">Failed to load captcha</p>
                  <button onClick={fetchInitialData} className="text-blue-600 hover:text-blue-800">Try Again</button>
                </div>
              )}
              <input
                type="text"
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && captchaInput && !captchaLoading) {
                    handleSubmitCaptcha();
                  }
                }}
                placeholder="Enter code"
                maxLength={6}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg mb-4 text-xl text-center tracking-widest text-gray-900 focus:border-blue-500 focus:outline-none"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowModal(false);
                    setCaptchaInput('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitCaptcha}
                  disabled={!captchaInput || captchaLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}

        {showSearchModal && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-4 border-2 border-purple-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">Search Single Result</h2>
              <button
                onClick={() => {
                  setShowSearchModal(false);
                  setSearchRollCode('');
                  setSearchRollNo('');
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Roll Code</label>
              <input
                type="text"
                value={searchRollCode}
                onChange={(e) => setSearchRollCode(e.target.value)}
                placeholder="e.g. 84038"
                maxLength={5}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg text-gray-900 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Roll Number</label>
              <input
                type="text"
                value={searchRollNo}
                onChange={(e) => setSearchRollNo(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && searchRollCode && searchRollNo) {
                    const tempStudent: Student = {
                      id: Date.now(),
                      rollCode: searchRollCode.padStart(5, '0'),
                      rollNo: searchRollNo,
                      status: 'pending',
                    };
                    setStudents(prev => [...prev, tempStudent]);
                    setShowSearchModal(false);
                    setSearchRollCode('');
                    setSearchRollNo('');
                    addLog(`Added student: Roll Code ${tempStudent.rollCode}, Roll No ${tempStudent.rollNo}`);
                    setSelectedStudent(tempStudent);
                    setCaptchaInput('');
                    setShowModal(true);
                    await fetchInitialData();
                  }
                }}
                placeholder="e.g. 26010188"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg text-gray-900 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSearchModal(false);
                  setSearchRollCode('');
                  setSearchRollNo('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!searchRollCode || !searchRollNo) {
                    addLog('Please enter both Roll Code and Roll Number');
                    return;
                  }
                  const tempStudent: Student = {
                    id: Date.now(),
                    rollCode: searchRollCode.padStart(5, '0'),
                    rollNo: searchRollNo,
                    status: 'pending',
                  };
                  setStudents(prev => [...prev, tempStudent]);
                  setShowSearchModal(false);
                  setSearchRollCode('');
                  setSearchRollNo('');
                  addLog(`Added student: Roll Code ${tempStudent.rollCode}, Roll No ${tempStudent.rollNo}`);
                  setSelectedStudent(tempStudent);
                  setCaptchaInput('');
                  setShowModal(true);
                  await fetchInitialData();
                }}
                disabled={!searchRollCode || !searchRollNo}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium"
              >
                Search
              </button>
            </div>
          </div>
        )}

        {logMessages.length > 0 && (
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg mb-6 font-mono text-sm max-h-48 overflow-y-auto">
            <div className="font-bold mb-2 text-white">Console Log:</div>
            {logMessages.map((msg, idx) => (
              <div key={idx}>{msg}</div>
            ))}
          </div>
        )}

        {students.length > 0 && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 text-white">
                  <tr>
                    <th className="px-2 py-2 text-left">S.No</th>
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2 text-left">Roll Code</th>
                    <th className="px-2 py-2 text-left">Roll No</th>
                    <th className="px-2 py-2 text-center bg-purple-700">ENG</th>
                    <th className="px-2 py-2 text-center bg-purple-700">HIN</th>
                    <th className="px-2 py-2 text-center bg-purple-700">PHY</th>
                    <th className="px-2 py-2 text-center bg-purple-700">CHEM</th>
                    <th className="px-2 py-2 text-center bg-purple-700">MATH</th>
                    <th className="px-2 py-2 text-center bg-purple-700">BIO</th>
                    <th className="px-2 py-2 text-center bg-purple-700">ADD (Subject)</th>
                    <th className="px-2 py-2 text-center bg-green-700">Total</th>
                    <th className="px-2 py-2 text-center bg-blue-700">%</th>
                    <th className="px-2 py-2 text-center">Status</th>
                    <th className="px-2 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const getSubjectMarks = (name: string): string => {
                      if (!student.result?.subjects) return '-';
                      const sub = student.result.subjects.find(s => 
                        s.name.toLowerCase().includes(name.toLowerCase())
                      );
                      return sub ? sub.subjectTotal : '-';
                    };
                    const getSubjectName = (name: string): string => {
                      if (!student.result?.subjects) return name;
                      const sub = student.result.subjects.find(s => 
                        s.name.toLowerCase().includes(name.toLowerCase())
                      );
                      return sub ? sub.name : name;
                    };
                    const getAdditionalSubject = (): { name: string; marks: string } => {
                      if (!student.result?.subjects) return { name: 'ADD', marks: '-' };
                      const subjects = student.result.subjects;
                      
                      const mainCore = ['eng', 'hin', 'phy', 'chem'];
                      const coreSubjects = subjects.filter(s => 
                        mainCore.some(c => s.name.toLowerCase().includes(c))
                      );
                      
                      if (subjects.length >= 5) {
                        if (coreSubjects.length >= 4) {
                          return { name: subjects[subjects.length - 1].name, marks: subjects[subjects.length - 1].subjectTotal };
                        }
                      }
                      
                      const additional = subjects.find(s => {
                        const lowerName = s.name.toLowerCase();
                        return !mainCore.some(m => lowerName.includes(m));
                      });
                      
                      return additional ? { name: additional.name, marks: additional.subjectTotal } : { name: 'ADD', marks: '-' };
                    };
                    const additionalSubject = getAdditionalSubject();
                    return (
                      <tr key={student.id} className="border-t hover:bg-gray-50">
                        <td className="px-2 py-2">{student.id + 1}</td>
                        <td className="px-2 py-2 font-medium max-w-[150px] truncate">{student.name || '-'}</td>
                        <td className="px-2 py-2 font-mono">{student.rollCode}</td>
                        <td className="px-2 py-2 font-mono">{student.rollNo}</td>
                        <td className="px-2 py-2 text-center font-mono">{getSubjectMarks('eng')}</td>
                        <td className="px-2 py-2 text-center font-mono">{getSubjectMarks('hin')}</td>
                        <td className="px-2 py-2 text-center font-mono">{getSubjectMarks('phy')}</td>
                        <td className="px-2 py-2 text-center font-mono">{getSubjectMarks('chem')}</td>
                        <td className="px-2 py-2 text-center font-mono">{getSubjectMarks('math')}</td>
                        <td className="px-2 py-2 text-center font-mono">{getSubjectMarks('bio')}</td>
                        <td className="px-2 py-2 text-center">
                          <span className="font-medium text-xs">{additionalSubject.name}</span>
                          <br />
                          <span className="font-mono">{additionalSubject.marks}</span>
                        </td>
                        <td className="px-2 py-2 text-center font-bold bg-green-50">{student.result?.aggregateMarks || '-'}</td>
                        <td className="px-2 py-2 text-center font-bold text-blue-600">{student.result?.percentage ? `${student.result.percentage}%` : '-'}</td>
                        <td className="px-2 py-2 text-center">
                          {student.status === 'pending' && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">Pending</span>
                          )}
                          {student.status === 'fetching' && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Fetching...</span>
                          )}
                          {student.status === 'success' && (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Done</span>
                          )}
                          {student.status === 'error' && (
                            <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">Error</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() => handleGetResult(student)}
                            disabled={student.status === 'fetching' || student.status === 'success'}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Get
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
