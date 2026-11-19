import Link from "next/link";
import { KreoLogo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";

export const metadata = { robots: { index: false, follow: false } };

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-dots flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link href="/" aria-label="Kreo">
          <KreoLogo className="h-7" />
        </Link>
        <LocaleSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="surface w-full max-w-md rounded-2xl p-6 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
