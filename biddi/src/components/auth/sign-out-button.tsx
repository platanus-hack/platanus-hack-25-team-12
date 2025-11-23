"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <button
      onClick={handleSignOut}
      className="bg-white/10 text-white font-medium py-2 px-4 rounded-xl hover:bg-white/20 transition-all duration-200 border border-white/20 text-sm"
    >
      Sign Out
    </button>
  );
}
