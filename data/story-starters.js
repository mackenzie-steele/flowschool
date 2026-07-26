// ─── FLOW SCHOOL — STORY STARTERS ────────────────────────────────────────────
// Source: Flow School Manual, pp. 66-67 (Story Structure + Story Starters).
// Shared by story-starters.html (draw) and stories.html (write/read/edit) and
// the dashboard's Weekly Story Starter.
//
// FOR NOW there is a single starter, paired with Bonnie's voice note and a
// "How to teach this" guide. The full manual set of 19 is PARKED at the bottom
// of this file — move rows back into STORY_STARTERS to bring them back.
//
// A starter may carry:
//   text          — the prompt shown on the dashboard / draw page / composer
//   voice          — audio url (dashboard shows a player); streams only on play
//   voiceDuration  — seconds, so the length shows without downloading the audio
//   voicePeaks     — pre-computed 256-bucket waveform, so the wave draws instantly
//   howTo          — [{ label, text }] teaching guide shown in the composer
// ─────────────────────────────────────────────────────────────────────────────

var STORY_STARTERS = [
  {
    id: 1,
    text: 'What’s something you’re trying not to be? What if it’s part of your gift?',
    voice: 'audio/intense-and-intentional.m4a',
    voiceDuration: 850.6,
    voicePeaks: [714,613,705,300,216,344,679,899,330,444,343,411,516,325,554,571,352,222,359,413,518,367,318,241,565,408,591,766,349,343,425,350,321,376,318,768,295,272,218,566,463,274,475,367,357,497,408,331,294,162,267,336,382,402,401,321,212,242,248,4,117,315,342,482,358,438,398,508,339,407,295,379,333,351,395,397,350,321,411,725,475,254,849,416,507,407,453,540,407,315,394,372,434,566,703,443,574,264,355,286,286,417,385,512,475,571,386,273,316,386,237,464,346,249,523,366,238,248,276,144,419,306,337,267,395,246,306,292,481,269,394,243,311,354,261,450,304,413,366,417,195,337,230,308,206,136,389,254,371,285,315,247,177,74,630,429,502,416,324,568,306,458,411,286,553,483,405,241,327,459,724,330,345,229,334,714,364,384,433,373,608,417,420,380,356,592,260,403,281,226,336,397,334,315,339,224,254,333,452,262,251,237,312,407,371,480,398,386,206,289,443,292,310,191,225,161,235,318,361,331,442,350,316,283,205,445,478,575,667,306,682,376,606,406,420,443,514,255,365,453,459,392,502,432,348,525,388,583,306,1000,324,215,150,270,274,184],
    howTo: [
      { label: 'Story Theme', text: 'Claim all the parts of yourself as the gifts you give.' },
      { label: 'Personal Story', text: 'Tell about journaling on this or use the first “I am” word to tell about an experience that relates directly. Keep this short and sweet. Less is more.' },
      { label: 'Expand the Room', text: 'Invite students to silently explore their “I am ____ and I am ____” statement. Relate it to the class experience by saying: “Today as we move together, own every part of yourself. Stand tall. Bring who you are on the inside to your posture. You get to claim, befriend, and embody it all. Bring your weirdest and wildest self.”' },
      { label: 'Close the Loop', text: 'When you’re closing class, share: “I am grateful. Thank you for arriving today as your whole damn self. The world needs the real you.”' },
    ],
  },
];

// ─── PARKED — the full manual set (19), off until we bring them back ──────────
// Move any of these back into STORY_STARTERS above to reactivate them.
// var PARKED_STORY_STARTERS = [
//   { id: 1,  text: 'Think about a time you were learning something brand new — and did NOT "succeed" at it the first time. What was the thing? How did you learn to do it eventually?' },
//   { id: 2,  text: 'When did you show up and have to trust the timing of a thing?' },
//   { id: 3,  text: 'What happens if we stop taking everything so seriously? What if we play?' },
//   { id: 4,  text: 'There are so many ways to be right. What if we embraced what was right, right now — whatever that looks like?' },
//   { id: 5,  text: "When have you been so wrapped up in what's happened and what's to come that you missed right now? Don't miss this." },
//   { id: 6,  text: 'Where has consistency made a difference?' },
//   { id: 7,  text: 'How can we reframe failure as practice — an opportunity to refine our approach?' },
//   { id: 8,  text: 'When has curiosity led you to uncover something unexpected?' },
//   { id: 9,  text: 'When were you stronger than you realized?' },
//   { id: 10, text: "You don't have to do this alone. When did someone show up for you?" },
//   { id: 11, text: 'Tell me about when you were brave.' },
//   { id: 12, text: 'When did you realize you had everything you needed?' },
//   { id: 13, text: 'When did you realize it was okay to do something new and different — and not die?' },
//   { id: 14, text: "The practice of paying attention is bigger than movement — it's everything. What have you been paying attention to?" },
//   { id: 15, text: 'When did you remember to breathe — in a moment that needed it?' },
//   { id: 16, text: 'A story about balance. On or off the mat.' },
//   { id: 17, text: 'A story about flexibility that has nothing to do with your hamstrings.' },
//   { id: 18, text: 'When did experimenting pay off?' },
//   { id: 19, text: 'Where did your confidence come from?' },
// ];
