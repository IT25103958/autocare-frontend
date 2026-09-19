"use client";

import { useState } from "react";
import Link from "next/link";

export default function ProfileSettings() {
  const [activeTab, setActiveTab] = useState("personal");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Using your details as the default state to mimic a fetched user profile
  const [personalInfo, setPersonalInfo] = useState({
    fullName: "Dhananjana Keshara",
    email: "dhananjana.k@example.com",
    phone: "+94 77 123 4567",
  });

  const [securityInfo, setSecurityInfo] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage("");

    // Simulate API network request
    setTimeout(() => {
      setIsSaving(false);
      setSaveMessage("Changes saved successfully.");
      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(""), 3000);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">

      {/* Header */}
      <div className="mb-8 flex items-center justify-between max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Account Settings</h1>
          <p className="text-slate-500 font-medium mt-1">Manage your profile details and security preferences.</p>
        </div>
        <Link href="/customer/dashboard" className="text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors">
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Main Container */}
      <div className="max-w-5xl mx-auto">

        {/* --- HORIZONTAL NAVIGATION TABS --- */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

          <div className="flex border-b border-slate-200 bg-slate-50/50">
            <button
              onClick={() => setActiveTab("personal")}
              className={`flex-1 py-4 text-sm font-bold transition-all relative ${
                activeTab === "personal"
                  ? "text-blue-600 bg-white"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              }`}
            >
              👤 Personal Details
              {activeTab === "personal" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></span>}
            </button>
            <button
              onClick={() => setActiveTab("security")}
              className={`flex-1 py-4 text-sm font-bold transition-all relative ${
                activeTab === "security"
                  ? "text-blue-600 bg-white"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              }`}
            >
              🔒 Security & Password
              {activeTab === "security" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></span>}
            </button>
          </div>

          {/* --- FORM CONTENT --- */}
          <div className="p-8">

            {activeTab === "personal" && (
              <form onSubmit={handleSave} className="animate-fade-in">
                <h2 className="text-xl font-bold text-slate-800 mb-6 border-b pb-4">Personal Information</h2>

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={personalInfo.fullName}
                      onChange={(e) => setPersonalInfo({...personalInfo, fullName: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Email Address</label>
                      <input
                        type="email"
                        value={personalInfo.email}
                        onChange={(e) => setPersonalInfo({...personalInfo, email: e.target.value})}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Phone Number</label>
                      <input
                        type="tel"
                        value={personalInfo.phone}
                        onChange={(e) => setPersonalInfo({...personalInfo, phone: e.target.value})}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-green-600 font-bold text-sm">{saveMessage}</span>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-6 rounded-lg transition-colors disabled:opacity-70"
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            )}

            {activeTab === "security" && (
              <form onSubmit={handleSave} className="animate-fade-in">
                <h2 className="text-xl font-bold text-slate-800 mb-6 border-b pb-4">Update Password</h2>

                <div className="space-y-5 max-w-md">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Current Password</label>
                    <input
                      type="password"
                      value={securityInfo.currentPassword}
                      onChange={(e) => setSecurityInfo({...securityInfo, currentPassword: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">New Password</label>
                    <input
                      type="password"
                      value={securityInfo.newPassword}
                      onChange={(e) => setSecurityInfo({...securityInfo, newPassword: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={securityInfo.confirmPassword}
                      onChange={(e) => setSecurityInfo({...securityInfo, confirmPassword: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-green-600 font-bold text-sm">{saveMessage}</span>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg transition-colors disabled:opacity-70"
                  >
                    {isSaving ? "Updating..." : "Update Password"}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}