import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  QrCode,
  Syringe,
  HeartPulse,
  Pill,
  Stethoscope,
  MapPin,
  ShieldCheck,
  Check,
  Building2,
  Store,
  Hotel,
  School,
  Dog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import heroPet from "@/assets/hero-pet.jpg";

export const Route = createFileRoute("/")({
  component: Landing,
});

const benefits = [
  { icon: HeartPulse, title: "Histórico médico instantâneo", desc: "Todo o histórico clínico do seu pet acessível em segundos." },
  { icon: Syringe, title: "Carteira de vacinação digital", desc: "Vacinas em dia, com lembretes automáticos das próximas doses." },
  { icon: Pill, title: "Alergias e medicações", desc: "Informações críticas sempre visíveis para veterinários." },
  { icon: Stethoscope, title: "Compartilhamento com veterinários", desc: "Autorize o acesso a clínicas parceiras com um toque." },
  { icon: MapPin, title: "Modo perdido", desc: "Ative um alerta público para ajudar a encontrar seu pet." },
  { icon: QrCode, title: "Perfil por QR Code", desc: "Um QR Code único no coleira leva ao perfil do seu pet." },
];

const steps = [
  { n: "01", title: "Cadastre seu pet", desc: "Adicione foto, raça, idade, microchip e contatos." },
  { n: "02", title: "Receba seu QR Code", desc: "Um código único é gerado para o coleira." },
  { n: "03", title: "Compartilhe com segurança", desc: "Controle o que é público e o que fica privado." },
  { n: "04", title: "Acesse em qualquer lugar", desc: "Do consultório à hospedagem, sempre acessível." },
];

const partners = [
  { icon: Building2, label: "Clínicas veterinárias" },
  { icon: Store, label: "Pet shops" },
  { icon: Hotel, label: "Hotéis para pets" },
  { icon: School, label: "Creches" },
  { icon: Dog, label: "Adestradores" },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Logo />
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#beneficios" className="text-sm text-muted-foreground hover:text-foreground">Benefícios</a>
            <a href="#como-funciona" className="text-sm text-muted-foreground hover:text-foreground">Como funciona</a>
            <a href="#parceiros" className="text-sm text-muted-foreground hover:text-foreground">Parceiros</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link to="/auth">Começar grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-2 md:py-32">
          <div className="flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-medium text-accent-foreground">
              <ShieldCheck className="h-3.5 w-3.5" style={{ color: "oklch(0.45 0.15 165)" }} />
              <span style={{ color: "oklch(0.35 0.12 165)" }}>Identidade digital segura para pets</span>
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-foreground md:text-6xl">
              A identidade digital <br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                do seu pet
              </span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              Mantenha informações importantes do seu pet sempre acessíveis através de um perfil digital inteligente e um QR Code exclusivo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full">
                <Link to="/auth">
                  Criar perfil gratuitamente
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <a href="#como-funciona">Ver demonstração</a>
              </Button>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Check className="h-4 w-4 text-accent" /> Grátis para começar</div>
              <div className="flex items-center gap-2"><Check className="h-4 w-4 text-accent" /> Sem cartão</div>
            </div>
          </div>
          <div className="relative">
            <div
              className="absolute -inset-4 rounded-3xl opacity-30 blur-3xl"
              style={{ background: "var(--gradient-brand)" }}
            />
            <img
              src={heroPet}
              alt="Cão feliz com coleira inteligente e QR Code PetID"
              width={1280}
              height={1280}
              className="relative aspect-square w-full rounded-3xl object-cover shadow-[var(--shadow-elegant)]"
            />
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="beneficios" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Tudo sobre seu pet em um só lugar</h2>
          <p className="mt-4 text-muted-foreground">
            Do histórico médico ao modo perdido, PetID centraliza o que importa.
          </p>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <div
              key={b.title}
              className="group rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-card)]"
            >
              <div
                className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-brand)" }}
              >
                <b.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{b.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="como-funciona" className="border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Como funciona</h2>
            <p className="mt-4 text-muted-foreground">
              Do cadastro ao QR Code em minutos.
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-border bg-card p-6">
                <div
                  className="mb-4 text-4xl font-bold bg-clip-text text-transparent"
                  style={{ backgroundImage: "var(--gradient-brand)" }}
                >
                  {s.n}
                </div>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners */}
      <section id="parceiros" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Para toda a rede que cuida do seu pet</h2>
          <p className="mt-4 text-muted-foreground">
            PetID conecta tutores, veterinários e parceiros de confiança.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-5">
          {partners.map((p) => (
            <div
              key={p.label}
              className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center"
            >
              <p.icon className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium">{p.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div
          className="relative overflow-hidden rounded-3xl p-12 text-center md:p-20"
          style={{ background: "var(--gradient-brand)" }}
        >
          <h2 className="text-3xl font-bold tracking-tight text-primary-foreground md:text-5xl">
            Proteja quem faz parte da sua família.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-primary-foreground/85">
            Comece agora — grátis — e tenha a tranquilidade de saber que as informações do seu pet estão sempre acessíveis.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-8 rounded-full">
            <Link to="/auth">
              Criar perfil gratuitamente
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
          <Logo />
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} PetID. A identidade digital do seu pet.
          </p>
        </div>
      </footer>
    </div>
  );
}
