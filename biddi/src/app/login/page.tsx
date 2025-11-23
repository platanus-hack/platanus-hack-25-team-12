import { AuthForm } from "@/components/auth/auth-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="w-full px-6 py-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <span className="text-2xl font-bold text-black">BodyCart</span>
            </Link>

            <Link
              href="/"
              className="text-neutral-500 hover:text-black transition-colors text-sm"
            >
              &larr; Back to Home
            </Link>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <AuthForm />
        </main>

        {/* Footer */}
        <footer className="w-full px-6 py-6">
          <div className="max-w-7xl mx-auto text-center text-neutral-500 text-sm">
            <p>
              &copy; {new Date().getFullYear()} BodyCart. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
