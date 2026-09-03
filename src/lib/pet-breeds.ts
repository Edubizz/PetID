/**
 * Breed options by species — client-side only (no DB migration).
 * Structured for easy expansion to more species later.
 */

export const BREED_SPECIAL = {
  srd: "SRD / Sem Raça Definida",
  other: "Outra",
} as const;

/** Common dog breeds (pt-BR labels). Curated for real product use — not exhaustive. */
const DOG_BREEDS = [
  BREED_SPECIAL.srd,
  "Affenpinscher",
  "Akita",
  "American Bully",
  "American Staffordshire Terrier",
  "Basenji",
  "Basset Hound",
  "Beagle",
  "Bernese Mountain Dog",
  "Bichon Frisé",
  "Border Collie",
  "Boston Terrier",
  "Boxer",
  "Bulldog Francês",
  "Bulldog Inglês",
  "Bull Terrier",
  "Cane Corso",
  "Cavalier King Charles Spaniel",
  "Chihuahua",
  "Chow Chow",
  "Cocker Spaniel",
  "Collie",
  "Dachshund (Salsicha)",
  "Dálmata",
  "Doberman",
  "Dogo Argentino",
  "Fila Brasileiro",
  "Golden Retriever",
  "Husky Siberiano",
  "Jack Russell Terrier",
  "Labrador Retriever",
  "Lhasa Apso",
  "Maltês",
  "Pastor Alemão",
  "Pastor Australiano",
  "Pastor Belga",
  "Pinscher",
  "Pit Bull",
  "Poodle",
  "Pug",
  "Rottweiler",
  "Schnauzer",
  "Shar-Pei",
  "Shiba Inu",
  "Shih Tzu",
  "Spitz Alemão (Lulu da Pomerânia)",
  "Staffordshire Bull Terrier",
  "Weimaraner",
  "Welsh Corgi",
  "West Highland White Terrier",
  "Yorkshire Terrier",
  BREED_SPECIAL.other,
] as const;

/** Common cat breeds (pt-BR labels). */
const CAT_BREEDS = [
  BREED_SPECIAL.srd,
  "Abissínio",
  "American Shorthair",
  "Angorá",
  "Bengal",
  "Birmanês",
  "British Shorthair",
  "Chartreux",
  "Exótico de Pelo Curto",
  "Himalaio",
  "Maine Coon",
  "Manx",
  "Munchkin",
  "Norueguês da Floresta",
  "Oriental",
  "Persa",
  "Ragdoll",
  "Russian Blue",
  "Sagrado da Birmânia",
  "Scottish Fold",
  "Siamês",
  "Siberiano",
  "Singapura",
  "Somali",
  "Sphynx",
  "Tonquinês",
  BREED_SPECIAL.other,
] as const;

/** Lightweight lists for other supported species. */
const BIRD_BREEDS = [
  BREED_SPECIAL.srd,
  "Calopsita",
  "Canário",
  "Periquito",
  "Papagaio",
  "Agapornis",
  "Cacatua",
  BREED_SPECIAL.other,
] as const;

const RODENT_BREEDS = [
  BREED_SPECIAL.srd,
  "Hamster",
  "Porquinho-da-índia",
  "Chinchila",
  "Twister",
  "Gerbil",
  BREED_SPECIAL.other,
] as const;

const REPTILE_BREEDS = [
  BREED_SPECIAL.srd,
  "Jabuti",
  "Iguana",
  "Gecko",
  "Corn Snake",
  "Python",
  BREED_SPECIAL.other,
] as const;

const FALLBACK_BREEDS = [BREED_SPECIAL.srd, BREED_SPECIAL.other] as const;

/**
 * Maps stored `pets.species` (pt-BR) → breed option list.
 * Unknown / empty species get a minimal SRD + Outra fallback.
 */
export const BREEDS_BY_SPECIES: Record<string, readonly string[]> = {
  Cachorro: DOG_BREEDS,
  Gato: CAT_BREEDS,
  Ave: BIRD_BREEDS,
  Roedor: RODENT_BREEDS,
  Réptil: REPTILE_BREEDS,
  Outro: FALLBACK_BREEDS,
};

export function getBreedOptionsForSpecies(species: string | null | undefined): readonly string[] {
  const raw = !species
    ? FALLBACK_BREEDS
    : (BREEDS_BY_SPECIES[species] ?? FALLBACK_BREEDS);
  // Pin "Outra" first so custom breeds are easy to find; never duplicate.
  const rest = raw.filter((b) => b !== BREED_SPECIAL.other);
  return [BREED_SPECIAL.other, ...rest];
}

/** True when the value is a known non-"Outra" option for that species. */
export function isKnownBreed(species: string | null | undefined, breed: string | null | undefined): boolean {
  if (!breed) return false;
  const options = getBreedOptionsForSpecies(species);
  return options.includes(breed) && breed !== BREED_SPECIAL.other;
}
