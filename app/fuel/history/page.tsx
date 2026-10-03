"use client";

import FuelPosScreen from "../_components/FuelPosScreen";

// The pump sales history on its own page, so the attendant's sale screen stays clear.
export default function FuelSalesHistoryPage() {
  return <FuelPosScreen historyOnly />;
}
