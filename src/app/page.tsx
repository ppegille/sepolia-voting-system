import { AdminDashboard } from "../components/admin-dashboard";
import { WalletStatus } from "../components/wallet-status";

export default function Home() {
  const setupItems = [
    "Next.js App Router frontend",
    "Cloudflare Pages static export",
    "Cloudflare Workers API scaffold",
    "Workers KV metadata binding",
    "MetaMask Sepolia wallet readiness",
    "Admin election package creation",
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-10 sm:px-10 lg:py-16">
        <div className="rounded-[2rem] border border-cyan-300/20 bg-cyan-300/10 p-6 shadow-2xl shadow-cyan-950/40 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-cyan-200">
            Phase 5 administrator flow
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
            Sepolia voting system administration gateway
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            The MVP can now connect an administrator wallet, create election
            metadata, register candidates, and generate invite links before
            later phases add onchain transactions.
          </p>
        </div>

        <WalletStatus />

        <AdminDashboard />

        <div className="grid gap-4 md:grid-cols-2">
          {setupItems.map((item) => (
            <div
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
              key={item}
            >
              <p className="text-sm text-slate-400">Configured</p>
              <p className="mt-2 text-xl font-semibold">{item}</p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-6">
          <h2 className="text-2xl font-bold">Current boundary</h2>
          <p className="mt-3 max-w-3xl leading-7 text-slate-300">
            Workers KV is reserved for offchain metadata such as candidate
            names, image URLs, invite links, and audit logs. Vote counts and
            duplicate-vote prevention remain onchain responsibilities.
          </p>
        </div>
      </section>
    </main>
  );
}
