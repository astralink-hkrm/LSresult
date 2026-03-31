import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import dbConnect from '@/lib/mongodb';
import RajasthanResult from '@/models/RajasthanResult';

const SCIENCE_URL = 'https://liveresults.jagranjosh.com/Result2026/jsp/rj/RJ_SC12.jsp';
const ARTS_URL = 'https://liveresults.jagranjosh.com/Result2026/jsp/rj/RJ_ART12.jsp';

const parseResultHtml = (html: string) => {
  try {
    const cleanText = (s: string): string => 
      s.replace(/<[^>]+>/g, '')
       .replace(/&nbsp;/g, ' ')
       .replace(/\r?\n/g, ' ')
       .replace(/\s+/g, ' ')
       .trim();

    const getValue = (label: string): string => {
      const regex = new RegExp(`<p class="lbl">${label}:</p>\\s*<p class="name">([\\s\\S]*?)</p>`, 'i');
      const match = html.match(regex);
      return match ? cleanText(match[1]) : '';
    };

    const candidateName = getValue('Candidate Name');
    const rollNumber = getValue('Roll No');
    const fatherName = getValue('Father Name');
    const motherName = getValue('Mother Name');
    const schoolName = getValue("School/Center's Name");

    const subjects: { name: string; total: string }[] = [];
    const subjectRowRegex = /<div class="subj_row">([\s\S]*?)<\/div>/gi;
    let match;
    while ((match = subjectRowRegex.exec(html)) !== null) {
      const rowContent = match[1];
      if (rowContent.includes('<span>Sub</span>') && rowContent.includes('<span>Total</span>')) {
        const nameMatch = rowContent.match(/<span>Sub<\/span>([\s\S]*?)<\/p>/i);
        const totalMatch = rowContent.match(/<span>Total<\/span>([\s\S]*?)<\/p>/i);
        if (nameMatch && totalMatch) {
          subjects.push({
            name: cleanText(nameMatch[1]),
            total: cleanText(totalMatch[1]),
          });
        }
      }
    }

    const getSummaryValue = (label: string): string => {
      const regex = new RegExp(`<p class="span25">${label}\\s*:</p>\\s*<p class="span22">([\\s\\S]*?)</p>`, 'i');
      const match = html.match(regex);
      return match ? cleanText(match[1]) : '';
    };

    const totalMarks = getSummaryValue('Total Marks');
    const resultDivision = getSummaryValue('Result');
    const percentage = getSummaryValue('Percentage');

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
      'Origin': 'https://liveresults.jagranjosh.com',
      'Referer': targetUrl,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    };

    console.log(`[API POST] Requesting: ${targetUrl}`);
    const response = await axios.post(
      targetUrl,
      `rollNo=${rollNo}`,
      { headers, maxRedirects: 5, timeout: 15000 }
    );

    const html = response.data;

    if (!html || !html.includes('Marks Detail')) {
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
