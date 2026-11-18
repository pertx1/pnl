import Link from "next/link";
import { KreoLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

// Placeholder hasta construir la landing con lista de espera (Fase 1).
export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-4 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(var(--foreground)_1px,transparent_1px),linear-gradient(90deg,var(--foreground)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />
      <KreoLogo className="h-12" blink />
      <h1 className="max-w-3xl text-4xl font-bold sm:text-6xl">
        Crea, programa y <span className="bg-primary px-2 text-primary-foreground">crece</span>.
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        La plataforma todo-en-uno para creadores, dropshippers, marcas y agencias. Muy pronto.
      </p>
      <p className="label-mono">status: en construcción · fase 0 completada</p>
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
