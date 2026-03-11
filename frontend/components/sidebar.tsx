"use client";

import { Home, Users, BookOpen, Settings } from "lucide-react";
import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="w-64 bg-white shadow-md p-6 min-h-screen">
      <h2 className="text-xl font-bold mb-8 text-blue-600">Dashboard</h2>

      <nav className="space-y-6">
        <Link href="/dashboard" className="flex items-center gap-3 text-gray-700 hover:text-blue-600 transition">
          <Home size={20} />
          Overview
        </Link>

        <div className="flex items-center gap-3 text-gray-700 hover:text-blue-600 cursor-pointer transition">
          <Users size={20} />
          Study Groups
        </div>

        <div className="flex items-center gap-3 text-gray-700 hover:text-blue-600 cursor-pointer transition">
          <BookOpen size={20} />
          Resources
        </div>

        <div className="flex items-center gap-3 text-gray-700 hover:text-blue-600 cursor-pointer transition">
          <Settings size={20} />
          Settings
        </div>
      </nav>
    </aside>
  );
}
