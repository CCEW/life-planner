"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function clearUserScopedStorage() {
  localStorage.removeItem("token");
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("life-planner:")) localStorage.removeItem(key);
  }
}

export default function AccountMenu({ fullName }: { fullName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initial = (fullName.trim()[0] ?? "?").toUpperCase();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    try {
      await fetch(`${API}/auth/signout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      clearUserScopedStorage();
      router.replace("/signin");
      router.refresh();
    }
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 rounded-full pl-2 pr-1 py-1 hover:bg-white/35 focus:outline-none focus:ring-2 focus:ring-[#1B3968]/20 transition-colors"
      >
        <span className="text-[#241715]/70 text-[13px] hidden sm:block max-w-[180px] truncate">
          {fullName}
        </span>
        <span className="w-8 h-8 rounded-full bg-[#6A9879] flex items-center justify-center">
          <span className="text-white text-xs font-semibold">{initial}</span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-20 w-56 rounded-xl border border-[#B3C1BB]/50 bg-white shadow-lg overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-[#B3C1BB]/25">
            <p className="text-[12px] text-[#94AAA1]">Signed in as</p>
            <p className="text-[13px] font-medium text-[#1a1a1a] truncate">{fullName}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full text-left px-4 py-3 text-[13px] font-medium text-[#9B3A2F] hover:bg-[#FFF4F2] disabled:opacity-60 transition-colors"
          >
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      )}
    </div>
  );
}
