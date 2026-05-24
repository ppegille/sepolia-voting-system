import { OperationsDashboard } from "../../components/operations-dashboard";

export default function AdminOperationsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100 sm:px-10">
      <div className="mx-auto max-w-7xl">
        <OperationsDashboard />
      </div>
    </main>
  );
}
