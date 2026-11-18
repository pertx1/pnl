import Link from "next/link";
import { KreoLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

// Placeholder hasta construir la landing con lista de espera (Fase 1).
export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-4 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-brand-gradient opacity-20 blur-3xl"
      />
      <KreoLogo className="h-12" />
      <h1 className="max-w-2xl text-4xl font-semibold sm:text-6xl">
        Crea, programa y <span className="text-brand-gradient">crece</span>.
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        La plataforma todo-en-uno para creadores, marcas y agencias. Muy pronto.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild variant="outline">
          <Link href="/design-system">Design system</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/brand-preview">Direcciones de marca</Link>
        </Button>
      </div>
    </main>
  );
}
