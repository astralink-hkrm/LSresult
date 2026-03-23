import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const BASE_URL = 'https://www.bsebexam.com';

function generateCaptcha(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  try {
    const { rollCode, rollNo, captcha, csrfToken, cookies } = await req.json();

    let cookieHeader = `.AspNetCore.Antiforgery.TBTj3XCYx2k=${csrfToken}`;
    if (cookies) {
      const cookieParts = Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`);
      cookieHeader += '; ' + cookieParts.join('; ');
    }

    const headers: Record<string, string> = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': BASE_URL,
      'Referer': `${BASE_URL}/`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Brave";v="146"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-user': '?1',
      'sec-gpc': '1',
      'Upgrade-Insecure-Requests': '1',
    };

    if (csrfToken) {
      headers['Cookie'] = cookieHeader;
    }

    const response = await axios.post(
      `${BASE_URL}/Result/GetResult`,
      `rollcode=${rollCode}&rollno=${rollNo}&captcha=${captcha}&__RequestVerificationToken=${csrfToken}`,
      {
        headers,
        maxRedirects: 0,
        validateStatus: (status) => status === 302 || status === 200,
      }
    );

    const setCookies = response.headers['set-cookie'] as string[];
    let newCookies: Record<string, string> = {};
    if (setCookies) {
      setCookies.forEach((cookie) => {
        const [pair] = cookie.split(';');
        const [key, value] = pair.split('=');
        if (key && value) {
          newCookies[key.trim()] = value.trim();
        }
      });
    }

    if (response.headers.location === '/Result/ShowResult') {
      const resultResponse = await axios.get(`${BASE_URL}/Result/ShowResult`, {
        headers: {
          ...headers,
          Cookie: `.AspNetCore.Antiforgery.TBTj3XCYx2k=${csrfToken}; .AspNetCore.Mvc.CookieTempDataProvider=${newCookies['.AspNetCore.Mvc.CookieTempDataProvider'] || ''}; .AspNetCore.Mvc.CookieTempDataProviderC1=${newCookies['.AspNetCore.Mvc.CookieTempDataProviderC1'] || ''}; .AspNetCore.Mvc.CookieTempDataProviderC2=${newCookies['.AspNetCore.Mvc.CookieTempDataProviderC2'] || ''}`,
          Referer: `${BASE_URL}/Result/GetResult`,
        },
      });

      return NextResponse.json({
        success: true,
        html: resultResponse.data,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid captcha or roll number',
    });
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { data?: unknown } };
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to fetch result',
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const response = await axios.get(`${BASE_URL}/`, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      },
    });

    const html = response.data;

    const tokenMatch = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i);
    const csrfToken = tokenMatch ? tokenMatch[1] : '';

    const cookies = response.headers['set-cookie'] as string[];
    let cookieObj: Record<string, string> = {};
    if (cookies) {
      cookies.forEach((cookie) => {
        const [pair] = cookie.split(';');
        const [key, value] = pair.split('=');
        if (key && value) {
          cookieObj[key.trim()] = value.trim();
        }
      });
    }

    const captchaCode = generateCaptcha();

    return NextResponse.json({
      captchaUrl: null,
      captchaCode,
      csrfToken,
      cookies: cookieObj,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({
      error: err.message || 'Failed to fetch initial page',
    }, { status: 500 });
  }
}