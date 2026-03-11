import Image from "next/image";
import Navbar from "../components/navbar";


export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center px-6">
      <h1 className="text-5xl font-extrabold text-gray-900 mb-6">
        Study Smarter Together
      </h1>

      <p className="text-lg text-gray-600 max-w-2xl mb-8">
        PeerStud connects students to collaborate, share resources, and stay
        productive — all in one place.
      </p>

      <div className="space-x-4">
        <a
          href="/register"
          className="bg-blue-600 text-white px-6 py-3 rounded-xl text-lg hover:bg-blue-700 transition"
        >
          Get Started
        </a>

        <a
          href="/login"
          className="border border-gray-300 px-6 py-3 rounded-xl text-lg hover:bg-gray-100 transition"
        >
          Sign In
        </a>
      </div>
    </main>
  );
}


