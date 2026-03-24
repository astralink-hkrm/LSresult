'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';

interface Student {
  id: number;
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
  studentName: string;
  fatherName: string;
  motherName: string;
  schoolName: string;
  rollNumber: string;
  subjects: Subject[];
  totalMarks: string;
  percentage: number;
  result: string;
}

interface Subject {
  name: string;
  marks: string;
  grade: string;
}

export default function RajasthanPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchRollNo, setSearchRollNo] = useState('');
  const [activeTab, setActiveTab] = useState<'10' | '12'>('10');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    console.log('File selected:', file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
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
          id: idx,
          rollNo: findColumnValue(r, ['roll no', 'rollno', 'roll number', 'roll']).replace(/\D/g, ''),
          name: findColumnValue(r, ['name', 'student']),
          mobile: findColumnValue(r, ['mobile', 'phone']),
          courseName: findColumnValue(r, ['course']),
          remark: findColumnValue(r, ['remark']),
          status: 'pending' as const,
        };
      }).filter((s): s is Student => s.rollNo !== '');

      console.log('Parsed', parsedStudents.length, 'students');
      setStudents(parsedStudents);
    };
    reader.readAsArrayBuffer(file);
  };

  const parseResultHtml = (html: string): ResultData | null => {
    try {
      const cleanText = (s: string): string => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();

      // Helper: find value in second <td> after a label
      const getRowValue = (label: string): string => {
        const labelIdx = html.indexOf(label);
        if (labelIdx === -1) return '';
        const section = html.substring(labelIdx, labelIdx + 400);
        // Find second <td> ... </td>
        const td2Start = section.indexOf('</td>', label.length) + 5;
        const td2End = section.indexOf('</td>', td2Start);
        if (td2Start < 5 || td2End === -1) return '';
        const td2 = section.substring(td2Start, td2End);
        // Get last font value (the actual value)
        const fontMatches = td2.match(/<font[^>]*>([\s\S]*?)<\/font>/gi);
        if (!fontMatches || fontMatches.length === 0) return cleanText(td2);
        return cleanText(fontMatches[fontMatches.length - 1]);
      };

      const rollNumber = getRowValue('Roll No.');
      const studentName = getRowValue('Name </font>');
      const fatherName = getRowValue("Father's Name");
      const motherName = getRowValue("Mother's");
      const schoolName = getRowValue("School/Center's");

      console.log('Personal:', { rollNumber, studentName, fatherName, motherName, schoolName });

       // Parse subjects - look for patterns in the marks section
       const subjects: Subject[] = [];
       const marksStart = html.indexOf('Marks Details');
       const marksEnd = html.indexOf('Final Result');

       console.log('Marks section:', marksStart, '-', marksEnd);

       if (marksStart > 0 && marksEnd > marksStart) {
         const marksHtml = html.substring(marksStart, marksEnd);
         console.log('Marks HTML length:', marksHtml.length);
         
         // Extract all font elements
         const fontRegex = /<font[^>]*>([\s\S]*?)<\/font>/gi;
         const allFonts: string[] = [];
         let m;
         while ((m = fontRegex.exec(marksHtml)) !== null) {
           const val = cleanText(m[1]);
           if (val) allFonts.push(val);
         }
         
         console.log('Total font elements found:', allFonts.length);
         console.log('All fonts:', allFonts);
         
         // Based on the HTML structure, subjects appear to be in groups of 6 font elements
         // Pattern: [Subject Name], [Some Value], [Some Value], [Some Value], [Some Value], [Marks]
         // But from the output, it seems like: [Marks1], [Marks2], [Marks3], [Marks4], [Marks5], [Subject Name]
         
         // Let's look for patterns where we have 5 numeric values followed by a text value
         for (let i = 0; i < allFonts.length; i++) {
           // Check if we have enough elements ahead
           if (i + 5 >= allFonts.length) break;
           
           // Check if current 5 elements are numeric (marks) and the 6th is text (subject name)
           const isNumeric = (str: string) => !isNaN(parseFloat(str));
           const fiveMarks = allFonts.slice(i, i + 5);
           const potentialSubject = allFonts[i + 5];
           
           // Check if first 5 are numeric marks and 6th is a potential subject name
           const allFiveNumeric = fiveMarks.every(isNumeric);
           const isLikelySubjectName = potentialSubject.length > 1 && 
                                     !isNumeric(potentialSubject) &&
                                     potentialSubject !== 'TH' && 
                                     potentialSubject !== 'SS' &&
                                     potentialSubject !== 'TH+SS' &&
                                     potentialSubject !== 'PR' &&
                                     potentialSubject !== 'Total';
                                     
           if (allFiveNumeric && isLikelySubjectName) {
             // We found a pattern: [mark1, mark2, mark3, mark4, mark5, subjectName]
             // But we need to map each mark to its corresponding subject
             // Based on the table structure, it seems like each row represents a student's marks
             // and columns represent subjects
             
             // Actually, looking at the desired output, it seems like:
             // Columns: S.No, Name, Roll No, 061, 020, 081, 074, 059, F. O. I. TECH., Total, %, Result
             // Where 061, 020, etc. are SUBJECT CODES and the values under them are MARKS
             
             // So the font elements we're seeing are actually the MARKS VALUES for each subject
             // and we need to get the SUBJECT NAMES from the table headers
             
             // Let's take a different approach - look for the table headers first
           }
         }
         
         // Alternative approach: Look for table headers that contain subject names
         // Then map the marks to those subjects
         
         // Let's try to extract subject names from table headers first
         const headerPatterns = [
           /<td[^>]*>[^<]*061[^<]*<\/td>/i,
           /<td[^>]*>[^<]*020[^<]*<\/td>/i,
           /<td[^>]*>[^<]*081[^<]*<\/td>/i,
           /<td[^>]*>[^<]*074[^<]*<\/td>/i,
           /<td[^>]*>[^<]*059[^<]*<\/td>/i,
           /<td[^>]*>[^<]*F\.?\s*O\.?\s*I\.?\s*TECH[^<]*<\/td>/i
         ];
         
         // Actually, let's look at the actual HTML structure more carefully
         // From the logs, we see values like 066, 020, 074, 062, 099, 094 which are the marks
         // And we want to map these to subject names like 061, 020, 081, 074, 059, F. O. I. TECH.
         
         // Let's look for a different pattern: maybe the subjects are in thead and marks in tbody
         const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
         const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
         
         if (theadMatch && tbodyMatch) {
           const theadHtml = theadMatch[1];
           const tbodyHtml = tbodyMatch[1];
           
           // Extract subject names from thead
           const headerFontRegex = /<font[^>]*>([\s\S]*?)<\/font>/gi;
           const headerFonts: string[] = [];
           let headerM;
           while ((headerM = headerFontRegex.exec(theadHtml)) !== null) {
             const val = cleanText(headerM[1]);
             if (val) headerFonts.push(val);
           }
           
           console.log('Header fonts:', headerFonts);
           
           // Extract marks from tbody
           const bodyFontRegex = /<font[^>]*>([\s\S]*?)<\/font>/gi;
           const bodyFonts: string[] = [];
           let bodyM;
           while ((bodyM = bodyFontRegex.exec(tbodyHtml)) !== null) {
             const val = cleanText(bodyM[1]);
             if (val) bodyFonts.push(val);
           }
           
           console.log('Body fonts:', bodyFonts);
           
           // If we have 6 header fonts (subject names) and 6 body fonts (marks for one student)
           if (headerFonts.length >= 6 && bodyFonts.length >= 6) {
             // Take the last 6 header fonts as subject names (skip S.No, Name, Roll No)
             const subjectNames = headerFonts.slice(Math.max(0, headerFonts.length - 6));
             // Take the first 6 body fonts as marks
             const subjectMarks = bodyFonts.slice(0, 6);
             
             console.log('Subject names from header:', subjectNames);
             console.log('Subject marks from body:', subjectMarks);
             
             // Create subjects array
             for (let j = 0; j < 6; j++) {
               const name = subjectNames[j];
               const marksStr = subjectMarks[j];
               
               // Skip if it's not a meaningful subject name
               if (name.length < 2 || 
                   name === 'TH' || name === 'SS' || name === 'TH+SS' || 
                   name === 'PR' || name === 'Total') {
                 continue;
               }
               
               const gradeMatch = marksStr.match(/[A-Z]$/);
               const numericPart = marksStr.replace(/[A-Z]$/, '').trim();
               
               subjects.push({
                 name,
                 marks: numericPart,
                 grade: gradeMatch ? gradeMatch[0] : '',
               });
             }
             
             console.log('Subjects found:', subjects.length, subjects.map(s => `${s.name}: ${s.marks}${s.grade}`));
           }
         }
         
         // Fallback to original method if the above didn't work
         if (subjects.length === 0) {
           console.log('Using fallback subject parsing');
           
           // Look for patterns in the marks section that might indicate subject rows
           const rows = marksHtml.split(/<tr[^>]*>/i);
           console.log('Rows split:', rows.length);
           
           for (let i = 0; i < rows.length; i++) {
             const row = rows[i];
             const lowerRow = row.toLowerCase();
             if (lowerRow.includes('subject name') || lowerRow.includes('marks obtained') || row.trim() === '') continue;
 
             const fonts: string[] = [];
             const fontRegex = /<font[^>]*>([\s\S]*?)<\/font>/gi;
             let m;
             while ((m = fontRegex.exec(row)) !== null) {
               const val = cleanText(m[1]);
               if (val) fonts.push(val);
             }
 
             // Look for patterns like [Subject Name, ..., Marks]
             if (fonts.length >= 6) {
               const name = fonts[0];
               if (name === 'TH' || name === 'SS' || name === 'TH+SS' || name === 'PR' || name === 'Total' || name.length < 2) continue;
               
               const totalStr = fonts[5];
               subjects.push({
                 name,
                 marks: totalStr.replace(/[A-Z]$/, '').trim(),
                 grade: totalStr.match(/[A-Z]$/)?.[0] || '',
               });
             }
           }
           
           console.log('Fallback subjects found:', subjects.length, subjects.map(s => s.name));
         }
       }
      console.log('Subjects found:', subjects.length, subjects.map(s => s.name));

      // Parse final result - use section-specific parsing
      let totalMarks = '';
      let percentage = 0;
      let result = 'Pass';

      const finalIdx = html.indexOf('Final Result');
      if (finalIdx > 0) {
        const finalHtml = html.substring(finalIdx, finalIdx + 2000);
        
        const getFinalValue = (label: string): string => {
          const idx = finalHtml.indexOf(label);
          if (idx === -1) return '';
          const section = finalHtml.substring(idx, idx + 400);
          const td2Start = section.indexOf('</td>', label.length) + 5;
          const td2End = section.indexOf('</td>', td2Start);
          if (td2Start < 5 || td2End === -1) return '';
          const td2 = section.substring(td2Start, td2End);
          const fontMatches = td2.match(/<font[^>]*>([\s\S]*?)<\/font>/gi);
          if (!fontMatches || fontMatches.length === 0) return cleanText(td2);
          return cleanText(fontMatches[fontMatches.length - 1]);
        };

        totalMarks = getFinalValue('Total Marks');
        const percVal = getFinalValue('Percentage');
        percentage = parseFloat(percVal) || 0;
        result = getFinalValue('Result') || 'Pass';
      }

      console.log('Final:', { totalMarks, percentage, result });

      return {
        studentName,
        fatherName,
        motherName,
        schoolName,
        rollNumber,
        subjects,
        totalMarks,
        percentage: Math.round(percentage * 100) / 100,
        result,
      };
    } catch (error) {
      console.error('Error parsing result HTML:', error);
      return null;
    }
  };

  const fetchResult = async (student: Student) => {
    console.log('Fetching result for:', student.name || student.rollNo);
    setStudents(prev =>
      prev.map(s =>
        s.id === student.id ? { ...s, status: 'fetching' } : s
      )
    );

    try {
      const res = await fetch('/api/rajasthan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rollNo: student.rollNo,
          class: activeTab,
        }),
      });

      const data = await res.json();
      console.log('FULL HTML:', data.html);

      if (data.success && data.html && data.html.includes('Personal Details')) {
        const resultData = parseResultHtml(data.html);
        if (resultData && resultData.studentName) {
          setStudents(prev =>
            prev.map(s =>
              s.id === student.id ? { ...s, status: 'success', result: resultData } : s
            )
          );
          console.log('Result fetched:', resultData.studentName);
        } else {
          throw new Error('Failed to parse result');
        }
      } else {
        throw new Error('Result not found for this roll number');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to fetch';
      console.error('Error:', errMsg);
      setStudents(prev =>
        prev.map(s =>
          s.id === student.id ? { ...s, status: 'error', error: errMsg } : s
        )
      );
    }
  };

  const fetchAllResults = async () => {
    const pendingStudents = students.filter(s => s.status === 'pending' || s.status === 'error');
    for (const student of pendingStudents) {
      await fetchResult(student);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  const exportToExcel = () => {
    console.log('Exporting to Excel...');
    const exportData = students
      .filter(s => s.status === 'success' && s.result)
      .map(s => {
        const r = s.result!;
        const row: Record<string, string | number> = {
          'S.No': s.id + 1,
          'Name': s.name || r.studentName,
          'Roll No': r.rollNumber,
          'Father Name': r.fatherName,
          'Mother Name': r.motherName,
          'School': r.schoolName,
          'Total Marks': r.totalMarks,
          '%': r.percentage,
          'Result': r.result,
        };

        r.subjects.forEach(sub => {
          row[sub.name] = sub.marks;
        });

        return row;
      });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, `RBSE_Class${activeTab}_Results.xlsx`);
    console.log('Exported', exportData.length, 'results');
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
            <h1 className="text-2xl font-bold text-orange-600">
              Rajasthan Board (RBSE) - Result Fetcher
            </h1>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('10')}
              className={`px-6 py-3 font-semibold ${
                activeTab === '10'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Class 10th
            </button>
            <button
              onClick={() => setActiveTab('12')}
              className={`px-6 py-3 font-semibold ${
                activeTab === '12'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Class 12th
            </button>
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
            {students.length > 0 && (
              <button
                onClick={fetchAllResults}
                disabled={pendingCount === 0}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium"
              >
                Fetch All ({pendingCount} pending)
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

        {showSearchModal && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-4 border-2 border-purple-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">Search Single Result</h2>
              <button
                onClick={() => {
                  setShowSearchModal(false);
                  setSearchRollNo('');
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Roll Number</label>
              <input
                type="text"
                value={searchRollNo}
                onChange={(e) => setSearchRollNo(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && searchRollNo) {
                    const tempStudent: Student = {
                      id: Date.now(),
                      rollNo: searchRollNo,
                      status: 'pending',
                    };
                    setStudents(prev => [...prev, tempStudent]);
                    setShowSearchModal(false);
                    setSearchRollNo('');
                    await fetchResult(tempStudent);
                  }
                }}
                placeholder="e.g. 1100384"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg text-gray-900 focus:border-purple-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSearchModal(false);
                  setSearchRollNo('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!searchRollNo) return;
                  const tempStudent: Student = {
                    id: Date.now(),
                    rollNo: searchRollNo,
                    status: 'pending',
                  };
                  setStudents(prev => [...prev, tempStudent]);
                  setShowSearchModal(false);
                  setSearchRollNo('');
                  await fetchResult(tempStudent);
                }}
                disabled={!searchRollNo}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium"
              >
                Search
              </button>
            </div>
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
                    <th className="px-2 py-2 text-left">Roll No</th>
                    {fetchedStudents.length > 0 && fetchedStudents[0].result?.subjects.map((sub, i) => (
                      <th key={i} className="px-1 py-2 text-center bg-purple-700 text-[10px]">{sub.name}</th>
                    ))}
                    <th className="px-2 py-2 text-center bg-orange-600">Total</th>
                    <th className="px-2 py-2 text-center bg-blue-600">%</th>
                    <th className="px-2 py-2 text-center">Result</th>
                    <th className="px-2 py-2 text-center">Status</th>
                    <th className="px-2 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id} className="border-t hover:bg-gray-50">
                      <td className="px-2 py-2">{student.id + 1}</td>
                      <td className="px-2 py-2 font-medium max-w-[150px] truncate">{student.name || student.result?.studentName || '-'}</td>
                      <td className="px-2 py-2 font-mono">{student.rollNo}</td>
                      {fetchedStudents.length > 0 && fetchedStudents[0].result?.subjects.map((sub, i) => {
                        const studentSubject = student.result?.subjects.find(s => s.name === sub.name);
                        return (
                          <td key={i} className="px-1 py-2 text-center text-xs">
                            {studentSubject?.marks || '-'}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center font-bold bg-orange-50">{student.result?.totalMarks || '-'}</td>
                      <td className="px-2 py-2 text-center font-bold text-blue-600">{student.result?.percentage ? `${student.result.percentage}%` : '-'}</td>
                      <td className="px-2 py-2 text-center">
                        {student.result?.result && (
                          <span className={`px-2 py-1 rounded text-xs ${
                            student.result.result.toLowerCase().includes('division')
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {student.result.result}
                          </span>
                        )}
                      </td>
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
                          onClick={() => fetchResult(student)}
                          disabled={student.status === 'fetching' || student.status === 'success'}
                          className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Get
                        </button>
                      </td>
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
