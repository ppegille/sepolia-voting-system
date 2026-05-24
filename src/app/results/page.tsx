import { ResultDashboard } from "../../components/result-dashboard";

export default function ResultsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:px-10 lg:py-16">
        <ResultDashboard mode="results" />
      </section>
    </main>
  );
}
