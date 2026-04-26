import Link from "next/link";

import type { ProductAccess } from "@/lib/auth";

type AccessPanelProps = {
  access: ProductAccess;
};

export function AccessPanel({ access }: AccessPanelProps) {
  const title =
    access.status === "configuration_required"
      ? "Configuration required"
      : access.status === "denied"
        ? "Access denied"
        : "Sign in required";

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
          Glassspider
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-4 leading-7 text-slate-700">
          {access.message ??
            "This product validates Laightworks access server-side before showing protected data."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
          >
            Back to overview
          </Link>
          <a
            href="https://laightworks.com/login"
            className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800"
          >
            Laightworks login
          </a>
        </div>
      </section>
    </main>
  );
}
