"use client";

import { useState, useEffect } from "react";
import api from "../../utils/axiosInstance";// Automatically handles JWT tokens!

// Define the shape of our data (Added email)
interface Customer {
  customerID: number;
  name: string;
  email: string;
  vehicleRegNo: string;
  contactNumber: string;
}

export default function CustomerRegistration() {
  // Added email to the form state
  const [formData, setFormData] = useState({ name: "", email: "", vehicleRegNo: "", contactNumber: "" });
  const [statusMessage, setStatusMessage] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);

  // The 'Read' Operation: Fetch all customers from the backend
  const fetchCustomers = async () => {
    try {
      // Using 'api' automatically prepends localhost:8080/api and attaches the token!
      const response = await api.get("/customers");
      setCustomers(response.data);
    } catch (error) {
      console.error("Failed to fetch customers", error);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // The 'Create' Operation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage("Registering...");

    try {
      const response = await api.post("/customers", formData);
      setStatusMessage(`Success! Vehicle ${response.data.vehicleRegNo} registered.`);
      setFormData({ name: "", email: "", vehicleRegNo: "", contactNumber: "" }); // Reset with email
      fetchCustomers();
    } catch (error: any) {
      console.error(error);
      // Grabs the custom exception message from your Spring Boot Service layer
      setStatusMessage(error.response?.data || "Error: Registration failed.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex flex-col items-center">

      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Register Customer</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" required placeholder="Customer Name" className="w-full px-4 py-2 border rounded-md text-black" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />

          {/* NEW: Email Input Field */}
          <input type="email" required placeholder="Email Address" className="w-full px-4 py-2 border rounded-md text-black" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />

          <input type="text" required placeholder="Vehicle Reg (e.g., CBA-4321)" className="w-full px-4 py-2 border rounded-md text-black" value={formData.vehicleRegNo} onChange={(e) => setFormData({ ...formData, vehicleRegNo: e.target.value })} />
          <input type="text" required placeholder="Contact Number" className="w-full px-4 py-2 border rounded-md text-black" value={formData.contactNumber} onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })} />

          <button type="submit" className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded hover:bg-blue-700">Register</button>
        </form>
        {statusMessage && <div className="mt-4 text-center font-semibold text-gray-700">{statusMessage}</div>}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-5xl">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Registered Vehicles</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm whitespace-nowrap text-gray-800">
            <thead className="uppercase tracking-wider border-b-2 border-gray-200 bg-gray-50">
              <tr>
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Customer Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Vehicle Reg</th>
                <th className="px-6 py-4">Contact</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.customerID} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-4">{c.customerID}</td>
                  <td className="px-6 py-4 font-medium">{c.name}</td>
                  {/* NEW: Render Email Column */}
                  <td className="px-6 py-4">{c.email}</td>
                  <td className="px-6 py-4">{c.vehicleRegNo}</td>
                  <td className="px-6 py-4">{c.contactNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}