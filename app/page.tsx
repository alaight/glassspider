import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl items-center gap-10 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-teal-700">
          Laightworks product
        </p>
        <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-slate-950">
          Bid intelligence for infrastructure opportunities before they renew.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
          Glassspider maps public procurement sources, stores the crawl trail,
          normalises award data, and turns contract history into a searchable
          renewal pipeline.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
          >
            Open dashboard
          </Link>
          <Link
            href="/admin"
            className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800"
          >
            Manage sources
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">MVP workflow</h2>
        <div className="mt-5 space-y-4">
          {[
            ["Configure", "Admin users define source rules, entry URLs, cadence, and compliance notes."],
            ["Map", "The crawler discovers relevant URLs and stores an auditable site map."],
            ["Extract", "Detail pages are scraped into raw records, then normalised into bid records."],
            ["Analyse", "Viewers search opportunities, renewal dates, buyers, suppliers, and sectors."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
