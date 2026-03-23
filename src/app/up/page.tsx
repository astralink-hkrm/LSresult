'use client';

import Link from 'next/link';

export default function UPPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block">
              ← Back to Home
            </Link>
            <h1 className="text-2xl font-bold text-green-600">
              Uttar Pradesh Board - Result Fetcher
            </h1>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <div className="text-6xl mb-4">🛤️</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-4">
            Uttar Pradesh Board (UPMSP) Result Fetcher
          </h2>
          <p className="text-gray-500 mb-6">
            This feature is coming soon. We are working on integrating the UP Board API.
          </p>
          <Link
            href="/bihar"
            className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Try Bihar Board Instead
          </Link>
        </div>
      </div>
    </div>
  );
}
