'use client';

import Link from 'next/link';

const boards = [
  {
    name: 'Bihar School Examination Board',
    shortName: 'BIHAR',
    slug: 'bihar',
    color: 'bg-red-600 hover:bg-red-700',
    description: 'BSEB Results 2026',
    icon: '🏛️',
  },
  {
    name: 'Rajasthan Board of Secondary Education',
    shortName: 'RAJASTHAN',
    slug: 'rajasthan',
    color: 'bg-orange-500 hover:bg-orange-600',
    description: 'RBSE Results 2026',
    icon: '🏜️',
  },
  {
    name: 'Uttar Pradesh Board',
    shortName: 'UP',
    slug: 'up',
    color: 'bg-green-600 hover:bg-green-700',
    description: 'UPMSP Results 2026',
    icon: '🛤️',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Result Fetcher
          </h1>
          <p className="text-lg text-gray-600">
            Select your board to fetch exam results
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {boards.map((board) => (
            <Link
              key={board.slug}
              href={`/${board.slug}`}
              className={`${board.color} text-white rounded-xl p-8 shadow-lg transition-transform hover:scale-105 block text-center`}
            >
              <div className="text-5xl mb-4">{board.icon}</div>
              <h2 className="text-2xl font-bold mb-2">{board.shortName}</h2>
              <p className="text-white text-opacity-90">{board.description}</p>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center text-gray-500">
          <p>Upload Excel files with roll numbers to fetch results in bulk</p>
        </div>
      </div>
    </div>
  );
}
