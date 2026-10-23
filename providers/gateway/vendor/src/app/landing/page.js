import Image from "next/image";

import Link from "next/link";
import ThemeToggle from "@/shared/components/ThemeToggle";
import GatewayOrbit from "@/shared/components/gateway-orbit";

const destinations = [
  { number: "01", icon: "dns", title: "Connect your providers", description: "Manage accounts and credentials in one place.", href: "/dashboard/providers" },
  { number: "02", icon: "layers", title: "Build your model routes", description: "Combine models and configure fallback routes.", href: "/dashboard/combos" },
  { number: "03", icon: "monitoring", title: "Understand every request", description: "Review usage, token consumption, and request logs.", href: "/dashboard/usage" },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-bg text-text-main">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-7">
        <Link href="/landing" className="flex items-center gap-3 font-semibold tracking-tight">
          <Image src="/favicon.svg" width="40" height="40" alt="" />
          Angela <span className="hidden text-sm font-normal text-text-muted sm:inline">/ Gateway</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <a href="https://github.com/lighthouse2815/Angela" target="_blank" rel="noopener noreferrer" className="hidden text-text-muted hover:text-primary sm:inline">GitHub</a>
          <ThemeToggle />
          <Link href="/dashboard" className="whitespace-nowrap rounded-full bg-text-main px-5 py-2.5 text-bg">Open workspace</Link>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 pb-16">
        <section className="grid items-center gap-12 py-16 lg:grid-cols-[1.2fr_1fr] lg:py-24">
          <div>
            <p className="angela-eyebrow mb-6">Your AI, connected</p>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[1.08] tracking-tight sm:text-7xl">Your models.<br /><span className="text-primary">One orbit.</span></h1>
            <p className="mt-7 max-w-md text-lg leading-relaxed text-text-muted">Connect your AI providers, shape your routes, and follow every request. All from your Angela workspace.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/dashboard/providers" className="flex items-center gap-3 rounded-full bg-primary px-6 py-3.5 font-medium text-white">Connect a provider <span aria-hidden="true">↗</span></Link>
              <Link href="/dashboard/endpoint" className="rounded-full border border-border px-6 py-3.5 font-medium hover:bg-surface">View endpoint</Link>
            </div>
          </div>
          <GatewayOrbit />
        </section>
        <section aria-label="Explore the workspace" className="grid gap-4 md:grid-cols-3">
          {destinations.map((item) => (
            <Link key={item.href} href={item.href} className="group rounded-3xl border border-border-subtle bg-surface p-7 transition-colors hover:border-primary">
              <div className="mb-8 flex items-center justify-between"><span className="material-symbols-outlined text-primary" aria-hidden="true">{item.icon}</span><span className="text-xs text-text-muted">{item.number}</span></div>
              <h2 className="text-lg font-semibold tracking-tight">{item.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">{item.description}</p>
              <span className="mt-6 block text-primary" aria-hidden="true">↗</span>
            </Link>
          ))}
        </section>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 border-t border-border-subtle px-6 py-7 text-xs text-text-muted"><span>Angela Gateway</span><span>One workspace. Every model.</span></footer>
    </div>
  );
}
