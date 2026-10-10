"use client";
import { createContext, type ReactNode, useContext } from "react";

const ApiOrigin = createContext("");
export function ApiOriginProvider({ origin, children }: { origin: string; children: ReactNode }) {
  return <ApiOrigin.Provider value={origin}>{children}</ApiOrigin.Provider>;
}
export const useApiOrigin = () => useContext(ApiOrigin);
