import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  QrCode,
  Syringe,
  HeartPulse,
  Pill,
  Stethoscope,
  ShieldCheck,
  Check,
  Building2,
  Store,
  Hotel,
  School,
  Dog,
  ScanLine,
  UserRound,
  Phone,
  FileText,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { LegalFooterLinks } from "@/components/legal/LegalFooterLinks";
import heroPet from "@/assets/hero-pet.jpg";
import { HERO_SLOGAN_CLASS, PETID_SLOGAN } from "@/lib/homepage-branding";

export const Route = createFileRoute("/")({
  component: Landing,
});

const SLOGAN = PETID_SLOGAN;

const lostPetFlow = [
  { n: "1", title: "Seu pet usa a identificação PetID", desc: "QR Code na coleira ou tag física." },
  { n: "2", title: "Alguém encontra seu pet", desc: "Em um momento de descuido, ele pode se afastar." },
  { n: "3", title: "A pessoa escaneia o QR Code", desc: "Sem precisar instalar nenhum app." },
  { n: "4", title: "O perfil público abre", desc: "Com o que você autorizou mostrar." },
  { n: "5", title: "Ela encontra seu contato", desc: "As formas de contato que você deixou disponíveis." },
];

const qrSteps = [
  {
    n: "01",
    title: "Crie o perfil do seu pet",
    desc: "Nome, foto e informações essenciais em um só lugar.",
  },
  {
    n: "02",
    title: "Escolha o que é público",
    desc: "Você controla o que aparece quando alguém escaneia.",
  },
  {
    n: "03",
    title: "Use o QR Code ou a tag PetID",
    desc: "Imprima, salve ou vincule à identificação física.",
  },
  {
    n: "04",
    title: "Se encontrarem seu pet, basta escanear",
    desc: "A pessoa acessa as informações autorizadas e pode tentar falar com você.",
  },
];

const secondaryFeatures = [
  { icon: CalendarDays, title: "Rotina do dia a dia", desc: "Água, alimentação e cuidados organizados." },
  { icon: HeartPulse, title: "Saúde em um só lugar", desc: "Peso, vacinas e histórico clínico acessíveis." },
  { icon: Syringe, title: "Carteira de vacinação", desc: "Vacinas registradas com lembretes das próximas doses." },
  { icon: Pill, title: "Alergias e medicações", desc: "Informações críticas sempre à mão." },
  { icon: FileText, title: "Documentos", desc: "Arquivos importantes do pet centralizados." },
  { icon: Stethoscope, title: "Acesso veterinário", desc: "Autorize clínicas parceiras quando precisar." },
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
    <div className="min-h-screen overflow-x-clip bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-6 lg:flex">
            <a href="#e-se-perder" className="text-sm text-muted-foreground hover:text-foreground">
              Se ele se perder
            </a>
            <a href="#como-qr" className="text-sm text-muted-foreground hover:text-foreground">
              QR Code
            </a>
            <a href="#mais-cuidados" className="text-sm text-muted-foreground hover:text-foreground">
              Cuidados
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="px-2.5 sm:px-3">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full px-3 sm:px-4">
              <Link to="/auth">Proteger meu pet</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero — QR / lost-pet as primary acquisition message */}
      <section className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-2 md:gap-12 md:py-24 lg:py-28">
          <div className="flex min-w-0 flex-col justify-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-primary sm:text-sm">
              Identidade digital para o seu pet
            </p>
            <h1 className="text-balance text-[1.75rem] font-bold leading-tight tracking-tight text-foreground sm:text-4xl md:text-[2.75rem] md:leading-[1.12]">
              Se ele se perder, uma identificação pode fazer toda a diferença.
            </h1>
            <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              Com o PetID, quem encontrar seu pet pode escanear o QR Code e acessar as informações que
              você escolheu compartilhar para entrar em contato com você.
            </p>
            <p className={HERO_SLOGAN_CLASS}>{SLOGAN}</p>
            <div className="mt-7 flex w-full max-w-md flex-col gap-2.5 sm:max-w-none sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="min-h-11 w-full rounded-full sm:w-auto">
                <Link to="/auth">
                  Proteger meu pet
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-11 w-full rounded-full sm:w-auto">
                <a href="#como-qr">Ver como funciona</a>
              </Button>
            </div>
            <div className="mt-8 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-accent" /> Sem app para quem escaneia
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-accent" /> Você controla o que é público
              </div>
            </div>
          </div>
          <div className="relative min-w-0">
            <div
              className="absolute -inset-3 rounded-3xl opacity-25 blur-3xl sm:-inset-4"
              style={{ background: "var(--gradient-brand)" }}
              aria-hidden
            />
            <img
              src={heroPet}
              alt="Cão com identificação PetID"
              width={1280}
              height={1280}
              className="relative aspect-[4/5] w-full max-h-[min(70vh,32rem)] rounded-2xl object-cover shadow-[var(--shadow-elegant)] sm:aspect-square sm:max-h-none sm:rounded-3xl md:max-h-none"
            />
          </div>
        </div>
      </section>

      {/* Emotional lost-pet section */}
      <section id="e-se-perder" className="scroll-mt-16 border-b border-border bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
              E se um dia ele se perder?
            </h2>
            <p className="mt-4 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              Quem encontra um pet perdido nem sempre sabe como localizar o tutor. Com o QR Code
              PetID, basta escanear para acessar as informações que você decidiu deixar disponíveis e
              tentar entrar em contato com você.
            </p>
          </div>

          <ol className="mx-auto mt-10 grid max-w-3xl gap-3 sm:mt-12 sm:gap-4">
            {lostPetFlow.map((step) => (
              <li
                key={step.n}
                className="flex min-w-0 items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 sm:gap-4 sm:px-5 sm:py-4"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-primary-foreground"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  {step.n}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 flex justify-center">
            <Button asChild size="lg" className="min-h-11 rounded-full px-8">
              <Link to="/auth">
                Quero proteger meu pet
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How QR works */}
      <section id="como-qr" className="scroll-mt-16">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <QrCode className="h-3.5 w-3.5" />
              Identificação por QR Code
            </div>
            <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
              Como funciona o QR Code PetID?
            </h2>
            <p className="mt-4 text-pretty text-sm text-muted-foreground sm:text-base">
              Uma identificação simples que ajuda quem encontrar seu pet a chegar até você — sem
              rastreamento GPS e sem exigir app para escanear.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {qrSteps.map((s) => (
              <div key={s.n} className="min-w-0 rounded-2xl border border-border bg-card p-5">
                <div
                  className="mb-3 text-3xl font-bold bg-clip-text text-transparent"
                  style={{ backgroundImage: "var(--gradient-brand)" }}
                >
                  {s.n}
                </div>
                <h3 className="text-base font-semibold sm:text-lg">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>

          <ul className="mx-auto mt-10 grid max-w-3xl gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <li className="flex gap-2">
              <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Não é preciso instalar app para escanear
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Você controla as informações públicas
            </li>
            <li className="flex gap-2">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Atualize o perfil sem trocar o QR Code
            </li>
            <li className="flex gap-2">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              No Modo Perdido, o contato fica em destaque
            </li>
          </ul>
          <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-muted-foreground">
            O QR Code PetID não rastreia localização nem oferece GPS em tempo real. Ele abre o
            perfil público que você configurou.
          </p>
        </div>
      </section>

      {/* Secondary value: organized info */}
      <section id="mais-cuidados" className="scroll-mt-16 border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
              E também organize tudo em um só lugar
            </h2>
            <p className="mt-4 text-pretty text-sm text-muted-foreground sm:text-base">
              Além da identificação, o PetID centraliza rotina, saúde e documentos — para o dia a
              dia ficar mais simples.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
            {secondaryFeatures.map((b) => (
              <div key={b.title} className="min-w-0 rounded-2xl border border-border bg-card p-5">
                <div
                  className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  <b.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-foreground">{b.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="parceiros" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            Para quem cuida junto com você
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Tutores, veterinários e parceiros de confiança no mesmo ecossistema.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
          {partners.map((p) => (
            <div
              key={p.label}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center sm:gap-3 sm:p-5"
            >
              <p.icon className="h-7 w-7 text-primary sm:h-8 sm:w-8" />
              <span className="text-xs font-medium sm:text-sm">{p.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div
          className="relative overflow-hidden rounded-2xl px-6 py-12 text-center sm:rounded-3xl sm:px-10 sm:py-16 md:p-20"
          style={{ background: "var(--gradient-brand)" }}
        >
          <p className="text-sm font-medium text-primary-foreground/90">{SLOGAN}</p>
          <h2 className="mt-3 text-balance text-2xl font-bold tracking-tight text-primary-foreground sm:text-3xl md:text-4xl">
            Mais do que um cadastro. Uma forma de ajudar seu pet a voltar para casa.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-sm text-primary-foreground/85 sm:text-base">
            Centralize identificação, saúde e rotina — e tenha um QR Code que pode ajudar quem
            encontrar seu pet a chegar até você.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-8 min-h-11 rounded-full">
            <Link to="/auth">
              Proteger meu pet
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:px-6 md:flex-row">
          <Logo />
          <LegalFooterLinks />
          <div className="text-center md:text-right">
            <p className="text-sm text-muted-foreground">{SLOGAN}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              © {new Date().getFullYear()} PetID · usepetid.com.br
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
