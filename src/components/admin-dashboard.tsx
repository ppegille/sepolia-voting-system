"use client";

import { useState } from "react";

import {
  createCandidate,
  createElection,
  createInvite,
  createInviteShareUrl,
  getVotingApiBaseUrl,
  isReadyForInvite,
  type CandidateRecord,
  type ElectionRecord,
  type InviteRecord,
} from "../admin/admin-api";
import {
  connectMetaMaskWallet,
  getInjectedMetaMaskProvider,
  isSepoliaChain,
  signAdminMessage,
  shortenAddress,
  switchToSepolia,
  type EthereumProvider,
  type WalletConnection,
} from "../wallet/metamask";

type InviteCreation = Readonly<{
  invite: InviteRecord;
  token: string;
  shareUrl: string;
}>;

const getDateTimeLocalValue = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

const createInitialElectionForm = () => {
  const now = Date.now();

  return {
    title: "",
    description: "",
    startAt: getDateTimeLocalValue(new Date(now + 60 * 60 * 1000)),
    endAt: getDateTimeLocalValue(new Date(now + 25 * 60 * 60 * 1000)),
  };
};

const createInitialInviteForm = () => ({
  expiresAt: getDateTimeLocalValue(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ),
});

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Admin request failed";
};

export function AdminDashboard() {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [provider, setProvider] = useState<EthereumProvider | null>(null);
  const [election, setElection] = useState<ElectionRecord | null>(null);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [inviteCreation, setInviteCreation] = useState<InviteCreation | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [electionForm, setElectionForm] = useState(createInitialElectionForm);
  const [candidateForm, setCandidateForm] = useState({
    name: "",
    photoUrl: "",
  });
  const [inviteForm, setInviteForm] = useState(createInitialInviteForm);

  const networkReady = wallet ? isSepoliaChain(wallet.chainId) : false;
  const canCreateElection = Boolean(wallet && networkReady);
  const canCreateCandidate = Boolean(election && wallet && networkReady);
  const canCreateInvite = Boolean(
    election && wallet && networkReady && isReadyForInvite(candidates.length),
  );

  const connectAdminWallet = async () => {
    const provider = getInjectedMetaMaskProvider();

    if (!provider) {
      setError("MetaMask is required for administrator actions");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const nextWallet = await connectMetaMaskWallet(provider);
      setProvider(provider);
      setWallet(nextWallet);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  };

  const switchAdminNetwork = async () => {
    const provider = getInjectedMetaMaskProvider();

    if (!provider) {
      setError("MetaMask is required for administrator actions");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      await switchToSepolia(provider);
      const nextWallet = await connectMetaMaskWallet(provider);
      setProvider(provider);
      setWallet(nextWallet);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  };

  const submitElection = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!wallet) {
      setError("Connect an administrator wallet first");
      return;
    }

    const currentProvider = provider ?? getInjectedMetaMaskProvider();

    if (!currentProvider) {
      setError("MetaMask is required to sign administrator requests");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const created = await createElection(electionForm, wallet.address, (message) =>
        signAdminMessage(currentProvider, wallet.address, message),
      );
      setElection(created);
      setCandidates([]);
      setInviteCreation(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  };

  const submitCandidate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!wallet || !election) {
      setError("Create an election before adding candidates");
      return;
    }

    const currentProvider = provider ?? getInjectedMetaMaskProvider();

    if (!currentProvider) {
      setError("MetaMask is required to sign administrator requests");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const created = await createCandidate(
        election.electionId,
        { ...candidateForm, displayOrder: candidates.length },
        wallet.address,
        (message) => signAdminMessage(currentProvider, wallet.address, message),
      );
      setCandidates((current) => [...current, created]);
      setCandidateForm({ name: "", photoUrl: "" });
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  };

  const submitInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!wallet || !election) {
      setError("Create an election before creating invites");
      return;
    }

    const currentProvider = provider ?? getInjectedMetaMaskProvider();

    if (!currentProvider) {
      setError("MetaMask is required to sign administrator requests");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const created = await createInvite(
        election.electionId,
        inviteForm,
        wallet.address,
        (message) => signAdminMessage(currentProvider, wallet.address, message),
      );
      const origin = window.location.origin;
      setInviteCreation({
        ...created,
        shareUrl: createInviteShareUrl(origin, created.token),
      });
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-emerald-300/20 bg-emerald-300/10 p-6 shadow-2xl shadow-black/20 sm:p-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-100">
            Phase 5 administrator flow
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
            Create an election package
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-slate-300">
            Use the connected MetaMask address as the election administrator,
            create offchain metadata in Workers KV, add at least two candidates,
            and generate a shareable invite token.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
          <p className="font-semibold text-white">API</p>
          <p className="mt-1 break-all">{getVotingApiBaseUrl()}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          className="rounded-full bg-emerald-300 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          onClick={connectAdminWallet}
          type="button"
        >
          {wallet ? "Reconnect admin wallet" : "Connect admin wallet"}
        </button>
        <button
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy || !wallet || networkReady}
          onClick={switchAdminNetwork}
          type="button"
        >
          Switch admin wallet to Sepolia
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <AdminStatusCard
          label="Admin wallet"
          state={wallet ? shortenAddress(wallet.address) : "Not connected"}
          tone={wallet ? "success" : "neutral"}
        />
        <AdminStatusCard
          label="Sepolia"
          state={networkReady ? "Ready" : "Required"}
          tone={networkReady ? "success" : "warning"}
        />
        <AdminStatusCard
          label="Candidate threshold"
          state={`${candidates.length}/2 minimum`}
          tone={isReadyForInvite(candidates.length) ? "success" : "warning"}
        />
      </div>

      {error ? (
        <p className="mt-5 rounded-2xl border border-red-300/30 bg-red-300/10 p-4 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <form
          className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"
          onSubmit={submitElection}
        >
          <h3 className="text-2xl font-black text-white">1. Create election</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            This creates KV metadata only. Phase 6 will submit the matching
            `createElection` transaction using the generated `electionId`.
          </p>
          <div className="mt-5 grid gap-4">
            <AdminInput
              label="Title"
              onChange={(value) => {
                setElectionForm((current) => ({ ...current, title: value }));
              }}
              required
              value={electionForm.title}
            />
            <label className="grid gap-2 text-sm font-semibold text-slate-200">
              Description
              <textarea
                className="min-h-28 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-emerald-200"
                onChange={(event) => {
                  setElectionForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }));
                }}
                required
                value={electionForm.description}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <AdminInput
                label="Start at"
                onChange={(value) => {
                  setElectionForm((current) => ({ ...current, startAt: value }));
                }}
                required
                type="datetime-local"
                value={electionForm.startAt}
              />
              <AdminInput
                label="End at"
                onChange={(value) => {
                  setElectionForm((current) => ({ ...current, endAt: value }));
                }}
                required
                type="datetime-local"
                value={electionForm.endAt}
              />
            </div>
          </div>
          <button
            className="mt-5 rounded-full bg-emerald-300 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy || !canCreateElection}
            type="submit"
          >
            Create election metadata
          </button>
        </form>

        <form
          className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"
          onSubmit={submitCandidate}
        >
          <h3 className="text-2xl font-black text-white">2. Add candidates</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Candidate names and photo URLs stay in KV. The metadata hash is
            generated with Ethereum keccak256 over canonical JSON.
          </p>
          <div className="mt-5 grid gap-4">
            <AdminInput
              label="Candidate name"
              onChange={(value) => {
                setCandidateForm((current) => ({ ...current, name: value }));
              }}
              required
              value={candidateForm.name}
            />
            <AdminInput
              label="Photo URL"
              onChange={(value) => {
                setCandidateForm((current) => ({ ...current, photoUrl: value }));
              }}
              required
              type="url"
              value={candidateForm.photoUrl}
            />
          </div>
          <button
            className="mt-5 rounded-full bg-emerald-300 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy || !canCreateCandidate}
            type="submit"
          >
            Add candidate
          </button>
        </form>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <h3 className="text-2xl font-black text-white">Created package</h3>
          {election ? (
            <div className="mt-4 space-y-4 text-sm text-slate-300">
              <p>
                <span className="font-semibold text-white">Election ID:</span>{" "}
                <span className="break-all font-mono">{election.electionId}</span>
              </p>
              <p>
                <span className="font-semibold text-white">Admin:</span>{" "}
                <span className="break-all font-mono">{election.adminWalletAddress}</span>
              </p>
              <div>
                <p className="font-semibold text-white">Candidates</p>
                <div className="mt-3 grid gap-3">
                  {candidates.length > 0 ? (
                    candidates.map((candidate) => (
                      <div
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                        key={candidate.candidateId}
                      >
                        <p className="font-semibold text-white">{candidate.name}</p>
                        <p className="mt-1 break-all font-mono text-xs">
                          {candidate.candidateId}
                        </p>
                        <p className="mt-1 break-all text-xs text-slate-400">
                          metadataHash {candidate.metadataHash}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p>No candidates yet.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-300">
              Connect an admin wallet on Sepolia and create an election first.
            </p>
          )}
        </div>

        <form
          className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"
          onSubmit={submitInvite}
        >
          <h3 className="text-2xl font-black text-white">3. Create invite link</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            The raw invite token is returned once. KV stores only its hash.
          </p>
          <div className="mt-5 grid gap-4">
            <AdminInput
              label="Invite expires at"
              onChange={(value) => {
                setInviteForm({ expiresAt: value });
              }}
              required
              type="datetime-local"
              value={inviteForm.expiresAt}
            />
          </div>
          <button
            className="mt-5 rounded-full bg-emerald-300 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy || !canCreateInvite}
            type="submit"
          >
            Create invite
          </button>
          {!isReadyForInvite(candidates.length) ? (
            <p className="mt-3 text-sm text-amber-100">
              Add at least two candidates before sharing a voting invite.
            </p>
          ) : null}
          {inviteCreation ? (
            <div className="mt-5 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm text-emerald-50">
              <p className="font-semibold">Invite created</p>
              <p className="mt-2 break-all font-mono">{inviteCreation.shareUrl}</p>
              <p className="mt-2 break-all text-xs opacity-80">
                Raw token: {inviteCreation.token}
              </p>
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}

function AdminInput({
  label,
  onChange,
  required = false,
  type = "text",
  value,
}: Readonly<{
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  value: string;
}>) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-200">
      {label}
      <input
        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-emerald-200"
        onChange={(event) => {
          onChange(event.target.value);
        }}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function AdminStatusCard({
  label,
  state,
  tone,
}: Readonly<{
  label: string;
  state: string;
  tone: "neutral" | "success" | "warning";
}>) {
  const toneClass = {
    neutral: "border-slate-500/30 bg-slate-500/10 text-slate-100",
    success: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
    warning: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  }[tone];

  return (
    <div className={`rounded-3xl border p-5 ${toneClass}`}>
      <p className="text-sm font-semibold opacity-80">{label}</p>
      <p className="mt-3 break-all text-xl font-black">{state}</p>
    </div>
  );
}
