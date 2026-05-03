'use client';

import { useState } from 'react';

type Props = {
  providerRole: 'trainer' | 'nutritionist';
  providerId: number;
  providerName: string;
};

export default function ProviderMessageButton({ providerRole, providerId, providerName }: Props) {
  const firstName = providerName.split(/\s+/)[0]?.replace(/^Dr\./, '').trim() || providerName;
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(
    `Hi ${firstName}, I found your profile on Shape and would like to learn more.`
  );
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function sendMessage() {
    const clean = message.trim();
    if (!clean) return;
    setStatus('sending');
    setError('');

    const response = await fetch('/api/messages/direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerRole,
        providerId,
        message: clean,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus('error');
      setError(payload.error || 'Unable to send message.');
      return;
    }

    setStatus('sent');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full rounded-full border border-white/20 px-6 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-white/10"
      >
        Message {firstName}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-neutral-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-teal-300">Message</p>
                <h2 className="mt-1 text-xl font-medium text-white">{providerName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/70 hover:text-white"
              >
                Close
              </button>
            </div>

            {status === 'sent' ? (
              <div className="rounded-xl border border-teal-300/25 bg-teal-300/10 p-4 text-sm text-teal-100">
                Message sent. This thread is now shared with the Shape app.
              </div>
            ) : (
              <>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={5}
                  className="w-full resize-none rounded-xl border border-white/15 bg-white/[0.03] p-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-teal-300/60"
                />
                {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={status === 'sending'}
                  className="mt-4 w-full rounded-full bg-white px-6 py-3 text-sm font-medium text-neutral-950 transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'sending' ? 'Sending...' : 'Send message'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
