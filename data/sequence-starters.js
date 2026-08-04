// ─── SEQUENCE STARTERS — the dashboard's weekly pose combos ──────────────────
//
// Pose combos to light up something new in a teacher's play — they inspire
// what gets planned and taught. Each links to its video on Uscreen.
//
// ADD, don't replace. The dashboard shows ONE at a time and rotates every
// Monday through however many are here — four entries is a four-week cycle.
// A starter that comes out of this list stops being reachable, so take one
// out only when it should stop being offered.
//   name — the starter's name (the pose combo)
//   img  — thumbnail path (drop screenshots in img/starters/; kebab-case
//          .jpg, 16:9 at 1280×720 and roughly 150KB. The thumb is width:100%
//          in the column, so on a retina screen a 640px file gets upscaled
//          about 2x and looks soft — 1280 is what makes it sharp.)
//   url  — the video's Uscreen link (flowschool.uscreen.io/programs/…)
//
// The teacher-facing description lives on the dashboard, not here — it's one
// line for the whole module, the same for every starter.
//
// ORDER IS THE SCHEDULE. Which starter is live is (weeks since 5 Jan 2026)
// modulo the list length, so moving an entry moves its week — and inserting
// one reshuffles everything after it. To put a starter live NOW, place it at
// the index currently showing rather than changing the epoch, which would
// shift the whole cycle.
// ─────────────────────────────────────────────────────────────────────────────

var SEQUENCE_STARTERS = [
  {
    name: 'Cactus Tadasana to Dive in Chair',
    img: 'img/starters/cactus-tadasana-to-dive-in-chair.jpg',
    url: 'https://flowschool.uscreen.io/programs/sequence-starter-cactus-tadasana-to-dive-in-chair',
  },
  {
    name: 'Shiva Squat to Funky Bound Half Moon',
    img: 'img/starters/shiva-squat-to-funky-bound-half-moon.jpg',
    url: 'https://flowschool.uscreen.io/programs/sequence-starter-shiva-squat-to-funky-bound-half-moon',
  },
  {
    name: 'Reach Back Standing Pigeon to Dancing Shiva',
    img: 'img/starters/reach-back-standing-pigeon-to-dancing-shiva.jpg',
    url: 'https://flowschool.uscreen.io/programs/sequence-starter-reach-back-standing-pigeon-to-dancing-shiva',
  },
  {
    name: 'Tabletop to Boat to Dancing Low Lunge',
    img: 'img/starters/tabletop-to-boat-to-dancing-low-lunge.jpg',
    url: 'https://flowschool.uscreen.io/programs/sequence-starter-tabletop-to-boat-to-dancing-low-lunge',
  },
];
