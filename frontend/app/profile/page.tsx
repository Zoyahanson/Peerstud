"use client";

import { useEffect, useState } from "react";

type Profile = {
  fullName: string;
  email: string;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({
    fullName: "PeerStud Demo User",
    email: "demo@peerstud.test",
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token && token !== "demo-token") {
      setProfile({
        fullName: "Authenticated User",
        email: "Connected account",
      });
    }
  }, []);

  return (
    <main className="min-h-screen bg-gray-100 p-10">
      <div className="max-w-3xl mx-auto bg-white p-6 rounded-2xl shadow border border-gray-100">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">My Account</h1>

        <div className="space-y-3">
          <p className="text-sm text-gray-600">Full name</p>
          <p className="text-lg font-medium text-gray-900">{profile.fullName}</p>

          <p className="text-sm text-gray-600 mt-4">Email</p>
          <p className="text-lg font-medium text-gray-900">{profile.email}</p>
        </div>
      </div>
    </main>
  );
}
