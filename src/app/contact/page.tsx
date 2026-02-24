"use client";

import { useState, FormEvent } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const SUBJECT_OPTIONS = [
  "Letter to the Editor",
  "Master Solvers' Club Problem Submission",
  "Challenge the Champs Hand Submission",
  "General Comments or Inquiries",
  "Technical Issues",
];

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }
      setSubmitted(true);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <h1 className="text-4xl sm:text-5xl font-serif font-bold tracking-tight text-gray-900 mb-2">
          Contact Us
        </h1>
        <p className="text-lg text-gray-500 mb-10">
          We&rsquo;d love to hear from you.
        </p>

        {submitted ? (
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-6 py-8 text-center">
            <p className="text-lg font-serif font-bold text-gray-900 mb-2">
              Thank you for your message.
            </p>
            <p className="text-gray-500">
              We&rsquo;ll be in touch soon.
            </p>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="mt-6 bg-stone-900 text-white px-4 py-2 rounded hover:bg-stone-700 transition-colors"
            >
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="subject"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Subject
              </label>
              <select
                id="subject"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent transition-colors"
              >
                <option value="" disabled>
                  Select a subject&hellip;
                </option>
                {SUBJECT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="message"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Message
              </label>
              <textarea
                id="message"
                required
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent transition-colors resize-y"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={sending}
              className="bg-stone-900 text-white px-6 py-2.5 rounded hover:bg-stone-700 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? "Sending…" : "Send Message"}
            </button>
          </form>
        )}
      </main>
      <Footer />
    </>
  );
}
