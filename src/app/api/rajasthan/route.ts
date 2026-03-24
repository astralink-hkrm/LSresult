import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const CLASS_10_URL = 'https://rajasthan-10th-result.indiaresults.com/rj/bser/class-10-result-2026/result.asp';
const CLASS_12_URL = 'https://rajasthan-12th-result.indiaresults.com/rj/bser/class-12-result-2026/result.asp';

export async function POST(req: NextRequest) {
  try {
    const { rollNo, class: classType } = await req.json();

    const targetUrl = classType === '10' ? CLASS_10_URL : CLASS_12_URL;

    const headers: Record<string, string> = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://rajasthan-10th-result.indiaresults.com',
      'Referer': targetUrl,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    const response = await axios.post(
      targetUrl,
      `rollno=${rollNo}`,
      {
        headers,
        maxRedirects: 5,
      }
    );

    const html = response.data;
    const statusCode = response.status;
    const contentLength = html.length;

    return NextResponse.json({
      success: true,
      html,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { data?: unknown } };
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to fetch result',
    }, { status: 500 });
  }
}
