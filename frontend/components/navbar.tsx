"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return Boolean(localStorage.getItem("token"));
  });
  const router = useRouter();

  useEffect(() => {
    function syncAuthState() {
      setLoggedIn(Boolean(localStorage.getItem("token")));
    }

    window.addEventListener("storage", syncAuthState);
    window.addEventListener("auth-changed", syncAuthState);

    return () => {
      window.removeEventListener("storage", syncAuthState);
      window.removeEventListener("auth-changed", syncAuthState);
    };
  }, []);

  return (
    <nav className="bg-white border-b shadow-sm">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
        
        {/* Left */}
        <div className="flex items-center space-x-8">
          <Link href="/" className="text-2xl font-bold text-blue-600">
            PeerStud
          </Link>

          <Link href="/" className="text-gray-600 hover:text-blue-600 transition">
            Home
          </Link>

          {loggedIn && (
            <Link href="/dashboard" className="text-gray-600 hover:text-blue-600 transition">
              Dashboard
            </Link>
          )}
        </div>

        {/* Right */}
        {loggedIn ? (
          <div className="relative">
            <button
              onClick={() => setOpen(!open)}
              className="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition"
            >
              <User size={20} />
              Profile
            </button>

            {open && (
              <div className="absolute right-0 mt-2 bg-white shadow-md rounded-lg p-4 w-40">
                <Link
                  href="/profile"
                  className="block hover:text-blue-600 cursor-pointer mb-2"
                  onClick={() => setOpen(false)}
                >
                  My Account
                </Link>
                <div
                  className="hover:text-red-500 cursor-pointer"
                  onClick={() => {
                    localStorage.removeItem("token");
                    window.dispatchEvent(new Event("auth-changed"));
                    setLoggedIn(false);
                    setOpen(false);
                    router.push("/");
                  }}
                >
                  Logout
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-x-6 text-gray-600 font-medium">
            <Link href="/login" className="hover:text-blue-600 transition">
              Login
            </Link>

            <Link
              href="/register"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Get Started
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
