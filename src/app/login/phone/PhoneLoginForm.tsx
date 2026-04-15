'use client';

// Two-step phone login form.
//   Step 1: user enters their phone number, we call sendPhoneOtp
//   Step 2: user enters the 6-digit code, we call verifyPhoneOtp
//
// hCaptcha is optional: it's only rendered if NEXT_PUBLIC_HCAPTCHA_SITE_KEY
// is set. With it set, the user has to pass the challenge before we'll send
// the code; without it, step 1 submits immediately. Supabase will reject the
// OTP request if your project has CAPTCHA enforcement on but we didn't send
// a token, so either both sides are configured or neither.

import { useRef, useState } from 'react';
import Link from 'next/link';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { sendPhoneOtp, verifyPhoneOtp } from './actions';

type Step = 'phone' | 'code';

const HCAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? '';

export default function PhoneLoginForm({ next = '' }: { next?: string }) {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);

  async function onSendCode(formData: FormData) {
    setSending(true);
    setError(null);
    if (HCAPTCHA_SITE_KEY && captchaToken) {
      formData.set('captcha_token', captchaToken);
    }
    const result = await sendPhoneOtp(formData);
    setSending(false);
    if ('error' in result) {
      setError(result.error);
      captchaRef.current?.resetCaptcha();
      setCaptchaToken(null);
      return;
    }
    setPhone(result.phone);
    setStep('code');
  }

  async function onVerifyCode(formData: FormData) {
    setVerifying(true);
    setError(null);
    const result = await verifyPhoneOtp(formData);
    // verifyPhoneOtp only returns on error — success triggers a server
    // redirect that unwinds the action before we get here.
    setVerifying(false);
    if (result && 'error' in result) {
      setError(result.error);
    }
  }

  if (step === 'code') {
    return (
      <form action={onVerifyCode} className="flex flex-col gap-4">
        <input type="hidden" name="phone" value={phone} />
        <input type="hidden" name="next" value={next} />
        <div className="text-sm text-neutral-400">
          We texted a 6-digit code to <span className="text-neutral-100">{phone}</span>.
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wider text-neutral-400">Code</span>
          <input
            type="text"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            required
            autoFocus
            className="px-4 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-sm outline-none focus:border-teal-400 transition-colors tracking-[0.3em] text-center text-lg"
          />
        </label>
        {error && (
          <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={verifying}
          className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors disabled:opacity-50"
        >
          {verifying ? 'Verifying…' : 'Verify and sign in'}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep('phone');
            setError(null);
          }}
          className="text-xs text-neutral-400 hover:text-neutral-200 self-center"
        >
          ← Use a different number
        </button>
      </form>
    );
  }

  return (
    <form action={onSendCode} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wider text-neutral-400">Phone number</span>
        <input
          type="tel"
          name="phone"
          required
          autoComplete="tel"
          placeholder="+1 555 123 4567"
          className="px-4 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-sm outline-none focus:border-teal-400 transition-colors"
        />
        <span className="text-xs text-neutral-500">
          Include your country code (e.g. +1 for US).
        </span>
      </label>

      {HCAPTCHA_SITE_KEY && (
        <div className="flex justify-center">
          <HCaptcha
            sitekey={HCAPTCHA_SITE_KEY}
            theme="dark"
            onVerify={(tok) => setCaptchaToken(tok)}
            onExpire={() => setCaptchaToken(null)}
            onError={() => setCaptchaToken(null)}
            ref={captchaRef}
          />
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={sending || (!!HCAPTCHA_SITE_KEY && !captchaToken)}
        className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors disabled:opacity-50"
      >
        {sending ? 'Sending…' : 'Text me a code'}
      </button>
      <p className="text-sm text-neutral-400 text-center">
        Prefer email?{' '}
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-teal-400 hover:text-teal-300">
          Use email login
        </Link>
      </p>
    </form>
  );
}
