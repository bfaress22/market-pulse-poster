import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowRight,
  Sparkles,
  Zap,
  Brain,
  Image as ImageIcon,
  Calendar,
  Globe,
  Shield,
  Rocket,
  CheckCircle2,
  Linkedin,
} from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setMouse({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("revealed");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(230,35%,5%)] text-white antialiased">
      {/* Ambient gradient orbs */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute h-[60vh] w-[60vh] rounded-full opacity-40 blur-[120px] transition-transform duration-700 ease-out"
          style={{
            background: "radial-gradient(circle, hsl(217 91% 60%) 0%, transparent 70%)",
            transform: `translate(${mouse.x * 100 - 50}px, ${mouse.y * 100 - 50}px)`,
            top: "-10%",
            left: "20%",
          }}
        />
        <div
          className="absolute h-[50vh] w-[50vh] rounded-full opacity-30 blur-[120px] transition-transform duration-700 ease-out"
          style={{
            background: "radial-gradient(circle, hsl(280 90% 60%) 0%, transparent 70%)",
            transform: `translate(${-mouse.x * 80 + 40}px, ${-mouse.y * 80 + 40}px)`,
            top: "30%",
            right: "10%",
          }}
        />
        <div
          className="absolute bottom-0 left-1/2 h-[40vh] w-[40vh] -translate-x-1/2 rounded-full opacity-25 blur-[120px]"
          style={{ background: "radial-gradient(circle, hsl(190 90% 55%) 0%, transparent 70%)" }}
        />
      </div>

      {/* Grid overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(hsla(0,0%,100%,0.08) 1px, transparent 1px), linear-gradient(90deg, hsla(0,0%,100%,0.08) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        }}
      />

      {/* Nav */}
      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-tr from-blue-500 to-purple-500 blur-md opacity-70" />
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-500 to-purple-500">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
          <span className="text-lg font-semibold tracking-tight">AutoPost AI</span>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-white/70 md:flex">
          <a href="#features" className="hover:text-white transition">Features</a>
          <a href="#how" className="hover:text-white transition">How it works</a>
          <a href="#pricing" className="hover:text-white transition">Pricing</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-white/80 hover:text-white">Sign in</Link>
          <Button
            onClick={() => navigate("/auth")}
            className="group relative overflow-hidden bg-white text-black hover:bg-white/90"
          >
            <span className="relative z-10 flex items-center gap-1">
              Get started <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section ref={heroRef} className="relative z-10 mx-auto max-w-7xl px-6 pb-24 pt-16 md:pt-28">
        <div className="mx-auto max-w-4xl text-center">
          <div
            data-reveal
            className="reveal mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/80 backdrop-blur"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Now with GPT-5 & Gemini 3 — multi-model AI
          </div>

          <h1
            data-reveal
            className="reveal text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl"
            style={{ animationDelay: "0.1s" }}
          >
            Your LinkedIn,{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-300 bg-clip-text text-transparent">
                on autopilot
              </span>
              <span className="absolute -bottom-2 left-0 h-px w-full bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            </span>
          </h1>

          <p
            data-reveal
            className="reveal mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-white/70 md:text-xl"
            style={{ animationDelay: "0.2s" }}
          >
            Connect your LinkedIn page, choose your sources, pick your AI models — and let
            AutoPost generate, illustrate and schedule posts that sound like you.
          </p>

          <div
            data-reveal
            className="reveal mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ animationDelay: "0.3s" }}
          >
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
              className="group relative h-12 overflow-hidden bg-gradient-to-r from-blue-500 to-purple-500 px-7 text-base text-white hover:opacity-95"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <span className="relative flex items-center gap-2">
                Start free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Button>
            <a
              href="#how"
              className="inline-flex h-12 items-center gap-2 rounded-md border border-white/15 bg-white/5 px-6 text-sm text-white/90 backdrop-blur transition hover:bg-white/10"
            >
              See how it works
            </a>
          </div>

          <div
            data-reveal
            className="reveal mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-white/50"
            style={{ animationDelay: "0.4s" }}
          >
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> No card required</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Bring your own keys</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> 2-min setup</span>
          </div>
        </div>

        {/* Floating product mock */}
        <div
          data-reveal
          className="reveal relative mx-auto mt-20 max-w-5xl"
          style={{ animationDelay: "0.5s" }}
        >
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-blue-500/30 via-purple-500/30 to-cyan-400/30 opacity-60 blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-1 backdrop-blur-xl">
            <div className="rounded-xl border border-white/10 bg-[hsl(230,30%,7%)] p-6">
              <div className="mb-5 flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-400/70" />
                <div className="h-3 w-3 rounded-full bg-amber-400/70" />
                <div className="h-3 w-3 rounded-full bg-emerald-400/70" />
                <div className="ml-3 text-xs text-white/40">app.autopost.ai / dashboard</div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { icon: Brain, label: "AI draft", value: "Generated", color: "from-blue-500 to-cyan-400" },
                  { icon: ImageIcon, label: "Visual", value: "Rendered", color: "from-purple-500 to-pink-400" },
                  { icon: Calendar, label: "Scheduled", value: "Tomorrow 9:00", color: "from-emerald-500 to-teal-400" },
                ].map((c, i) => (
                  <div
                    key={i}
                    className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:bg-white/[0.06]"
                    style={{ animation: `floaty 6s ease-in-out ${i * 0.6}s infinite` }}
                  >
                    <div className={`mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr ${c.color}`}>
                      <c.icon className="h-4 w-4" />
                    </div>
                    <div className="text-xs uppercase tracking-wider text-white/50">{c.label}</div>
                    <div className="mt-1 text-lg font-medium">{c.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Latest post</div>
                <p className="text-sm leading-relaxed text-white/80">
                  "AI is no longer a tool — it's a teammate. Here's how we shipped 3x faster
                  this quarter using a multi-model workflow…"
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs text-white/40">
                  <Linkedin className="h-3.5 w-3.5" /> Posted to your page
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logos / trust */}
      <section className="relative z-10 border-y border-white/5 bg-white/[0.02] py-8 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-12 gap-y-4 px-6 text-xs uppercase tracking-[0.2em] text-white/40">
          <span>Powered by</span>
          <span>OpenAI</span>
          <span>Gemini</span>
          <span>Firecrawl</span>
          <span>LinkedIn API</span>
          <span>Supabase</span>
          <span>xAI</span>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-7xl px-6 py-28">
        <div data-reveal className="reveal mx-auto mb-16 max-w-2xl text-center">
          <div className="mb-3 text-xs uppercase tracking-[0.25em] text-white/50">Features</div>
          <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            Built for operators who ship.
          </h2>
          <p className="mt-4 text-white/60">
            Every piece is modular. Swap models, sources or schedules without touching code.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Brain, title: "Multi-model AI", desc: "Pick GPT-5, Gemini 3, or your own key. Different model per task — text, images, summaries." },
            { icon: Globe, title: "Smart sources", desc: "Add URLs or keywords. Firecrawl scrapes the web and feeds your AI fresh context." },
            { icon: ImageIcon, title: "On-brand visuals", desc: "Auto-generate post imagery in your style. Stored, versioned, ready to publish." },
            { icon: Calendar, title: "Scheduling", desc: "Queue posts to personal profile or company page. Retry on failure, never miss a beat." },
            { icon: Shield, title: "Your keys, your data", desc: "Row-level security on every table. BYOK for OpenAI & Gemini. Your tenant, isolated." },
            { icon: Zap, title: "Workflows", desc: "One click: scrape → draft → illustrate → schedule. Or trigger steps individually." },
          ].map((f, i) => (
            <div
              key={i}
              data-reveal
              className="reveal group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06]"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
              <div className="relative">
                <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-tr from-white/10 to-white/[0.02]">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-medium">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative z-10 mx-auto max-w-7xl px-6 py-28">
        <div data-reveal className="reveal mx-auto mb-16 max-w-2xl text-center">
          <div className="mb-3 text-xs uppercase tracking-[0.25em] text-white/50">Workflow</div>
          <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            From idea to published — in 3 steps.
          </h2>
        </div>

        <div className="relative">
          <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/15 to-transparent md:block" />
          {[
            { n: "01", title: "Connect & configure", desc: "Link your LinkedIn page, choose sources (URLs / keywords), pick your AI models." },
            { n: "02", title: "Generate intelligently", desc: "AutoPost scrapes, summarizes, and drafts posts in your tone — with images if needed." },
            { n: "03", title: "Review & ship", desc: "Edit, schedule, or publish instantly. Track everything from one dashboard." },
          ].map((s, i) => (
            <div
              key={i}
              data-reveal
              className={`reveal relative mb-8 grid items-center gap-8 md:grid-cols-2 ${i % 2 ? "md:[direction:rtl]" : ""}`}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="md:[direction:ltr]">
                <div className="text-7xl font-semibold tracking-tighter text-white/10">{s.n}</div>
                <h3 className="mt-2 text-2xl font-medium">{s.title}</h3>
                <p className="mt-3 max-w-md text-white/60">{s.desc}</p>
              </div>
              <div className="md:[direction:ltr]">
                <div className="relative h-56 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-6">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,hsla(217,91%,60%,0.2),transparent_60%)]" />
                  <div className="relative flex h-full items-center justify-center text-6xl opacity-30">
                    {i === 0 ? <Linkedin className="h-20 w-20" /> : i === 1 ? <Brain className="h-20 w-20" /> : <Rocket className="h-20 w-20" />}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CEO / Founder */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-28">
        <div data-reveal className="reveal relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.01] p-10 backdrop-blur md:p-16">
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 blur-3xl" />
          <div className="relative grid gap-10 md:grid-cols-[auto,1fr] md:items-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 blur-xl opacity-70" />
              <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-gradient-to-br from-blue-500 to-purple-600 text-5xl font-semibold">
                A
              </div>
            </div>
            <div>
              <div className="mb-3 text-xs uppercase tracking-[0.25em] text-white/50">From the founder</div>
              <p className="text-pretty text-xl leading-relaxed text-white/85 md:text-2xl">
                "We built AutoPost because content shouldn't be a full-time job. Give the AI
                your sources and your voice — and reclaim your week."
              </p>
              <div className="mt-6">
                <div className="text-base font-medium">Alex Mercer</div>
                <div className="text-sm text-white/50">Founder & CEO, AutoPost AI</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="pricing" className="relative z-10 mx-auto max-w-4xl px-6 py-28 text-center">
        <div data-reveal className="reveal">
          <h2 className="text-balance text-5xl font-semibold tracking-tight md:text-6xl">
            Start posting{" "}
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-300 bg-clip-text text-transparent">
              smarter
            </span>{" "}
            today.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-white/60">
            Free to start. Bring your own keys for unlimited generation.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
              className="h-12 bg-white px-8 text-base text-black hover:bg-white/90"
            >
              Create your account <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/5 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-white/40 md:flex-row">
          <div>© {new Date().getFullYear()} AutoPost AI. All rights reserved.</div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-white">Privacy</a>
            <a href="#" className="hover:text-white">Terms</a>
            <a href="#" className="hover:text-white">Contact</a>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes floaty {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .reveal { opacity: 0; transform: translateY(24px); }
        .reveal.revealed {
          opacity: 1;
          transform: translateY(0);
          transition: opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1), transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
};

export default Landing;
