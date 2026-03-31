import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import dbConnect from '@/lib/mongodb';
import RajasthanResult from '@/models/RajasthanResult';

const SCIENCE_URL = 'https://rajeduboard.rajasthan.gov.in/RESULT2026/SCIENCE/Roll_Output.asp';
const ARTS_URL = 'https://rajeduboard.rajasthan.gov.in/RESULT2026/ARTS/Roll_Output.asp';

const parseResultHtml = (html: string) => {
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
    const subjects: { name: string; total: string }[] = [];
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
      rollNumber,
      fatherName,
      motherName,
      schoolName,
      subjects,
      totalMarks,
      resultDivision,
      percentage,
    };
  } catch {
    return null;
  }
};

export async function POST(req: NextRequest) {
  try {
    const { rollNo, stream, mobile } = await req.json();
    console.log(`[API POST] Fetching result for Roll: ${rollNo}, Stream: ${stream}`);

    const targetUrl = stream === 'science' ? SCIENCE_URL : ARTS_URL;

    const headers: Record<string, string> = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://rajeduboard.rajasthan.gov.in',
      'Referer': targetUrl.replace('Roll_Output.asp', 'Roll_Input.htm'),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    };

    console.log(`[API POST] Requesting: ${targetUrl}`);
    const response = await axios.post(
      targetUrl,
      `roll_no=${rollNo}&B1=Submit`,
      { headers, maxRedirects: 5, timeout: 15000 }
    );

    const html = response.data;

    if (!html || !html.includes('Result: Senior Secondary')) {
      console.log(`[API POST] Result not found in HTML for ${rollNo}`);
      return NextResponse.json({
        success: false,
        error: 'Result not found or invalid roll number',
      });
    }

    const resultData = parseResultHtml(html);
    if (!resultData) {
      return NextResponse.json({
        success: false,
        error: 'Failed to parse result',
      });
    }

    console.log(`[API POST] Result fetched for ${resultData.candidateName}`);

    let saved = false;
    let dbError: string | null = null;
    
    try {
      console.log(`[API POST] Connecting to MongoDB...`);
      const db = await dbConnect();
      
      if (db) {
        await RajasthanResult.findOneAndUpdate(
          { rollNo: resultData.rollNumber },
          {
            ...resultData,
            rollNo: resultData.rollNumber,
            stream,
            mobile,
            fetchedAt: new Date(),
          },
          { upsert: true, new: true }
        );
        saved = true;
        console.log(`[API POST] Result saved to database`);
      } else {
        dbError = 'Database connection unavailable';
        console.log(`[API POST] MongoDB unavailable - result NOT saved`);
      }
    } catch (err) {
      const error = err as Error;
      dbError = error.message;
      console.error(`[API POST] Database error:`, dbError);
    }

    return NextResponse.json({
      success: true,
      html,
      saved,
      dbError: dbError || undefined,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { status?: number } };
    console.error(`[API POST] Error:`, err.message);
    if (err.response) {
      console.error(`[API POST] Response Error Status:`, err.response.status);
    }
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to fetch result',
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    console.log(`[API GET] Fetching saved results...`);
    const db = await dbConnect();
    
    if (!db) {
      console.log(`[API GET] MongoDB unavailable`);
      return NextResponse.json({
        success: false,
        error: 'Database connection unavailable',
        results: [],
      }, { status: 503 });
    }
    
    const { searchParams } = new URL(req.url);
    const stream = searchParams.get('stream');
    
    const query = stream ? { stream } : {};
    const savedResults = await RajasthanResult.find(query).sort({ fetchedAt: -1 });
    console.log(`[API GET] Found ${savedResults.length} results`);

    return NextResponse.json({
      success: true,
      results: savedResults,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error(`[API GET] Error:`, err.message);
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to fetch saved results',
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = await dbConnect();
    
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'Database connection unavailable',
      }, { status: 503 });
    }
    
    const { searchParams } = new URL(req.url);
    const stream = searchParams.get('stream');
    
    const query = stream ? { stream } : {};
    await RajasthanResult.deleteMany(query);

    return NextResponse.json({
      success: true,
      message: 'Data cleared successfully',
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to clear data',
    }, { status: 500 });
  }
}
