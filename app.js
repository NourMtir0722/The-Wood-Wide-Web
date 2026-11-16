/* The Wood Wide Web: game UI
 * Title menu, audience age switcher, quest journal, lore meter, codex markers and toasts.
 * The 3D world lives in engine.js; everything here keeps working (minus the 3D) if the engine can't start.
 */
(() => {
  'use strict';

  const AGE_STORAGE_KEY = 'www-age-mode';

  // ===========================================================================
  // 1. Age-adapted content (Under 12 · Teens · Adults) & camera choreography
  // ===========================================================================
  const AGE_MODES = {
    kids: {
      badge: 'Under 12 · Simple & playful',
      titleSub: 'Discover the secret underground web where trees and fungi share snacks and warnings',
      sunQuestLabel: 'Field mission · Slide the sunshine power',
      sunSliderLabel: 'Sunshine power',
      closeupCaption: 'Super-thin fungal threads hug this tree root like a cozy glove, touching the outside of root cells (while other fungi poke tiny trading fingers right inside root cells!) to swap blue rock minerals for golden tree sugar.',
      loreHeading: 'Tell the whole secret in 60 seconds',
      loreSub: 'Four big forest secrets you can share with anyone.',
      riddlesHeading: 'Four questions curious kids always ask',
      riddlesSub: 'Tap a scroll to uncover how the underground forest really works.',
      menuChapters: [
        'Leaves & Rocks',
        'The Root Handshake',
        'Helping Baby Trees',
        'Secret Bug Alarms',
        'Sneaky Ghost Plants',
        'Healthy Living Soil'
      ],
      chapters: [
        {
          kicker: 'Chapter I · Two Halves of a Puzzle',
          title: 'Leaves cook sweet sugar, while rocks hide tiny minerals',
          text: 'Way up in the sunshine, green leaves cook up sweet <strong>sugar</strong> for food. Deep underground, <strong>water and rock minerals</strong> hide inside teeny-tiny stone cracks that are way too skinny for thick wooden tree roots to squeeze into alone!',
          mission: 'Dive underground into the root web'
        },
        {
          kicker: 'Chapter II · The Underground Swap',
          title: 'Fungi trade rock minerals for sweet tree sugar',
          text: 'Glowing <strong>fungal threads</strong> thinner than hair unlock blue rock minerals and hold hands with tree roots. Some fungi wrap around the outside of root cells like a glove, while others gently poke tiny trading fingers right inside the root cells! There, fungi hand over water and <strong>minerals</strong>, and get paid in golden sugar.',
          mission: 'Zoom in on the root handshake'
        },
        {
          kicker: 'Chapter III · Helping Baby Trees',
          title: 'Sunny giant trees share extra sugar with shaded saplings',
          text: 'One big fungal web connects the whole forest neighborhood! Tall trees soaking up bright sunshine pour extra sugar into the shared underground threads, where it flows into tiny <strong>baby trees</strong> waiting in the dark shade.',
          mission: ''
        },
        {
          kicker: 'Chapter IV · Secret Bug Alarms',
          title: 'Chewed-up trees send underground bug warnings',
          text: 'Uh-oh! Hungry caterpillars are munching the Elder Fir. Warning signals zip down its roots and race across the fungal bridges. Neighboring <strong>Paper Birches</strong> feel the alarm and mix up bitter, yucky-tasting leaves before the bugs march over!',
          mission: 'Send a caterpillar attack!'
        },
        {
          kicker: 'Chapter V · Sneaky Sugar Thieves',
          title: 'Spooky white plants sip free sugar from the web',
          text: 'Spot that pale white <strong>Ghost Pipe</strong> on the right? It has zero green leaves and cannot make food from sunshine at all! Instead, it plugs into the underground fungal threads like a tiny straw and sips free tree sugar without sharing anything back.',
          mission: 'Spot the sneaky Ghost Pipe'
        },
        {
          kicker: 'Chapter VI · Protect Living Soil',
          title: 'Harsh chemicals break this friendship, while healthy soil saves it!',
          text: 'Before dinosaurs existed, the very first land plants had <strong>no roots at all</strong> because friendly fungi fed them! Today, bug sprays and harsh <strong>chemical fertilizers</strong> hurt delicate fungi, and free chemical plant-food makes trees stop sharing sugar so the bridge breaks. Growing food gently with compost keeps soil alive!',
          missionShock: 'Test chemical fertilizer shock on the web',
          missionRestore: 'Restore healthy living soil!',
          toastShock: 'Free chemicals stopped the trade and fungal threads went dark!',
          toastRestore: 'Compost and gentle care brought the fungal web back!'
        }
      ],
      organisms: {
        fir: {
          title: 'Elder Fir',
          tag: 'Big sunny helper tree',
          what: 'A giant evergreen soaking up sunshine and connected underground to dozens of forest neighbors.',
          gives: 'Shares lots of sweet sun-made sugar into the underground fungal web',
          gets: 'Deep rock water and minerals delivered right to its root tips'
        },
        sapling: {
          title: 'Baby Sapling',
          tag: 'Little shaded tree',
          what: 'A tiny young tree growing in dark forest shade where almost no sunbeams reach.',
          gives: 'Will grow tall one day and share its own sunshine sugar back with the web',
          gets: 'Extra sugar and rock minerals sent across shared fungal bridges'
        },
        birch: {
          title: 'Paper Birch',
          tag: 'Friendly neighbor tree',
          what: 'A totally different kind of tree with white bark, yet plugged into the very same web!',
          gives: 'Extra summer leaf sugar into the shared underground threads',
          gets: 'Early caterpillar warnings and deep rock minerals'
        },
        mycelium: {
          title: 'Fungal Web',
          tag: 'The underground bridge',
          what: 'Miles of living threads 50 times skinnier than a hair! Mushrooms above ground are just its tiny fruit.',
          gives: 'Water and rock minerals squeezed out of tiny stone cracks roots cannot reach',
          gets: 'Sweet tree sugar, since fungi have no green leaves to cook their own food'
        },
        ghost: {
          title: 'Ghost Pipe',
          tag: 'Sneaky sugar thief',
          what: 'A spooky, waxy white forest plant with zero green leaves that acts like a tiny sugar freeloader.',
          gives: 'Nothing at all, because it never makes food from sunshine',
          gets: 'Free tree sugar sipped straight out of living fungal threads'
        }
      },
      tablets: [
        {
          title: 'Mushrooms are just the tiny fruit',
          body: 'A mushroom is not the whole fungus. It is like one apple on a giant hidden underground tree made of miles of threads!'
        },
        {
          title: 'Sugar swaps for rock minerals',
          body: 'Trees pay fungi with sweet sunshine sugar; fungi hug or reach gently inside root cells to pay back water and rock minerals.'
        },
        {
          title: 'One web connects the neighborhood',
          body: 'Shared fungal bridges let extra sugar reach shaded baby trees and carry early bug-attack warnings between neighbors.'
        },
        {
          title: 'Living soil grows healthy food',
          body: 'Harsh bug sprays and chemical fertilizers break this ancient friendship. Compost and gentle farming keep underground helpers thriving!'
        }
      ],
      riddles: [
        {
          q: 'Do big trees “think” like brains when feeding baby trees?',
          a: 'No brains needed! Sugar naturally flows from full, sunny tree roots toward hungry, shaded roots, and keeping young trees alive saves future partners for the fungi.'
        },
        {
          q: 'What happens if a tree or fungus tries to be greedy?',
          a: 'Both sides trade fairly like a swap meet: fungi bring more rock minerals to generous roots, and trees stop sending sugar to root tips where fungi do not share.'
        },
        {
          q: 'How fast do underground bug warnings travel?',
          a: 'About <strong>1 to 2 days</strong>, much slower than your nerves, yet plenty fast enough to beat munching caterpillars crawling from tree to tree!'
        },
        {
          q: 'How can kids and families help protect this underground web?',
          a: 'Long ago, the very first land plants had <strong>no roots at all</strong> and needed fungi to live! Harsh garden sprays and <strong>chemical fertilizers</strong> hurt fungi and make plants stop sharing sugar. You can help by composting kitchen scraps, skipping bug poisons, and planting lots of different flowers and veggies together!'
        }
      ]
    },

    teens: {
      badge: 'Teens · Clear forest science',
      titleSub: 'Explore how trees and fungi trade sugar, rock minerals, and warnings underground',
      sunQuestLabel: 'Field mission · Test the canopy sunlight',
      sunSliderLabel: 'Sunbeam power',
      closeupCaption: 'Depending on the type of fungus, threads either weave snugly around the outer walls of root cells (shown here) or reach gently inside the root cells themselves, swapping blue rock minerals for golden tree sugar without harming the root.',
      loreHeading: 'Explain the whole network in a minute',
      loreSub: 'Four core ideas connecting wild forests to the soil that grows our food.',
      riddlesHeading: 'Four questions people always ask',
      riddlesSub: 'Open a scroll to see how the underground trade really works.',
      menuChapters: [
        'Leaves & Rocks',
        'The Root Handshake',
        'Shared Forest Web',
        'Bug-Attack Warnings',
        'The Ghost Plant',
        'Living Soil & Us'
      ],
      chapters: [
        {
          kicker: 'Chapter I · The Forest Puzzle',
          title: 'Leaves brew sugar in sunlight, while rocks lock away minerals',
          text: 'Up in the sunlit canopy, leaves turn sunlight and air into energy-rich <strong>sugar</strong>. Deep underground, vital <strong>water, nitrogen, and phosphorus</strong> sit trapped inside microscopic rock cracks far too narrow for woody tree roots to enter alone.',
          mission: 'Dive the camera into the root web'
        },
        {
          kicker: 'Chapter II · The Root Handshake',
          title: 'Fungi wrap around or reach inside root cells to trade',
          text: 'Hair-thin <strong>fungal threads</strong> dissolve rock minerals and join directly with roots. Depending on the type of fungus, threads either sit touching the outer walls of root cells like a woven glove, or press gently inside the root cells themselves, trading water and <strong>minerals</strong> for golden tree sugar.',
          mission: 'Inspect the root handshake up close'
        },
        {
          kicker: 'Chapter III · Shared Forest Web',
          title: 'Sunlit elder trees route extra sugar to shaded saplings',
          text: 'Because one fungal web links many trees across the glade, including different species, resources move from high supply to high need. Tall sunlit trees pour surplus sugar into shared threads, helping <strong>shaded saplings</strong> survive on the dim forest floor.',
          mission: ''
        },
        {
          kicker: 'Chapter IV · Underground Warnings',
          title: 'Bitten trees send chemical bug alarms to their neighbors',
          text: 'When caterpillars chew on the Elder Fir, chemical stress signals travel down its roots and cross shared fungal bridges within a day or two. Neighboring <strong>Paper Birches</strong> detect the warning and brew bitter natural bug-repellent before pests arrive.',
          mission: 'Launch a caterpillar attack'
        },
        {
          kicker: 'Chapter V · Forest Freeloaders',
          title: 'Pale ghost plants live like parasites on the fungal web',
          text: 'Look closely at the waxy white <strong>Ghost Pipe</strong> on the right. With zero green pigment in its stems, it makes no food from sunlight at all. Instead, it lives like a quiet parasite, tapping straight into fungal threads to draw tree sugar without paying anything back.',
          mission: 'Fly over to the Ghost Pipe'
        },
        {
          kicker: 'Chapter VI · An Ancient Pact at Risk',
          title: 'Why synthetic chemicals break a 400-million-year partnership',
          text: 'Over 400 million years ago, the very first land plants had <strong>no roots at all</strong>. Fungi fed them, and roots evolved to give fungi more surface area to trade! Chemical pesticides kill sensitive fungal threads, while heavy <strong>chemical fertilizers</strong> hand plants free surface nutrients so they stop paying sugar and break the bond. Organic, living soil care brings it back.',
          missionShock: 'Simulate chemical fertilizer shock',
          missionRestore: 'Restore living soil',
          toastShock: 'Partnership broken: chemical inputs shut down the fungal web',
          toastRestore: 'Living soil restored: roots and fungi trade again'
        }
      ],
      organisms: {
        fir: {
          title: 'Elder Fir',
          tag: 'Sunlit hub tree',
          what: 'A towering evergreen linked underground to dozens of neighbors through deep roots and fungal threads.',
          gives: 'Up to a third of its sun-made carbon sugar into the fungal network',
          gets: 'Deep rock water, phosphorus, and nitrogen delivered to its roots'
        },
        sapling: {
          title: 'Shaded Sapling',
          tag: 'Young understory tree',
          what: 'A young evergreen growing under thick canopy shade where scarce sunlight reaches.',
          gives: 'A future sunlit sugar-trading partner once it reaches the canopy',
          gets: 'Extra sugar and rock minerals routed through shared fungal bridges'
        },
        birch: {
          title: 'Paper Birch',
          tag: 'Neighbor species',
          what: 'A completely different broadleaf species, yet wired into the very same underground fungal web.',
          gives: 'Summer leaf-sugar surpluses into the shared underground grid',
          gets: 'Early caterpillar-attack warnings and deep rock minerals'
        },
        mycelium: {
          title: 'Fungal Web',
          tag: 'The living network',
          what: 'Miles of living threads 50 times thinner than hair. Forest mushrooms aren’t just food, they are only its seasonal fruit.',
          gives: 'Water and minerals dissolved out of tiny rock pores roots cannot enter',
          gets: 'Sweet tree sugar, because fungi have no green leaves to make their own'
        },
        ghost: {
          title: 'Ghost Pipe',
          tag: 'Network parasite',
          what: 'An eerie, waxy white forest plant with no green pigment, living like a parasite on the underground web.',
          gives: 'Nothing at all, since it makes zero food from sunlight',
          gets: 'Free tree sugar drawn straight out of living fungal threads'
        }
      },
      tablets: [
        {
          title: 'Mushrooms aren’t just food, they’re only the fruit',
          body: 'Nearly the entire fungus lives out of sight underground as miles of threads weaving roots together; mushrooms are only its seasonal fruit.'
        },
        {
          title: 'Sugar trades for rock minerals',
          body: 'Trees pay fungi with sunlit sugar; fungi hug outer root cells or reach gently inside them to pay back deep water, nitrogen, and phosphorus.'
        },
        {
          title: 'One web links the neighborhood',
          body: 'Shared fungal bridges let extra sugar reach shaded saplings and carry chemical pest-attack warnings between trees around the world.'
        },
        {
          title: 'Living soil feeds our future',
          body: 'Chemical fertilizers and pesticides rupture this 400-million-year partnership and wear out soil; organic care restores it.'
        }
      ],
      riddles: [
        {
          q: 'Do big trees “think” like brains when feeding shaded saplings?',
          a: 'No brains required! Sugar naturally moves from sunlit, sugar-rich roots toward shaded, hungry roots, and keeping young trees alive protects future sugar-trading partners for the fungus.'
        },
        {
          q: 'What happens if a plant or fungus tries to cheat the deal?',
          a: 'Both sides bargain like a real market: fungi send more rock minerals toward generous sugar-paying roots, while plants cut off sugar to root tips where fungi hoard nutrients.'
        },
        {
          q: 'How fast do underground bug-attack warnings travel?',
          a: 'Roughly <strong>24 to 48 hours</strong>, far slower than animal nerves, yet plenty fast enough to beat caterpillars marching from trunk to trunk.'
        },
        {
          q: 'Why do synthetic fertilizers and pesticides damage farmland over time?',
          a: 'The earliest land plants had <strong>no roots at all</strong>. They relied completely on fungi, and roots evolved to expand that trade. Pesticides kill delicate fungal threads, while synthetic fertilizers dump free minerals on top so plants stop paying sugar and sever the connection. Without fungi mining deep trace minerals, soil wears out and food prices rise, which is why <strong>organic, living-soil farming</strong> matters.'
        }
      ]
    },

    adults: {
      badge: 'Adults · Science dictionary & research',
      titleSub: 'How trees, fungi, and living soil sustain forests and our food beneath our feet',
      sunQuestLabel: 'Field mission · Adjust canopy sunlight',
      sunSliderLabel: 'Canopy sunlight',
      closeupCaption: 'On this forest root, fungal threads weave a <strong>Hartig net</strong> <em>(noun: a microscopic web wrapping around the outer walls of root cells)</em>. In most farm crops and grasses, <strong>arbuscular</strong> threads <em>(adjective: pressing gently inside root cell walls to branch)</em> swap blue rock minerals for golden tree sugar without harming the root.',
      loreHeading: 'Explain the whole secret in a minute',
      loreSub: 'Four core truths connecting wild forests to the soil that grows our food.',
      riddlesHeading: 'Four questions listeners always ask',
      riddlesSub: 'Open a scroll to reveal the real forest & soil science.',
      menuChapters: [
        'Leaves & Rocks',
        'The Root Handshake',
        'Neighborhood Bridges',
        'Bug-Attack Warnings',
        'The Ghost Plant',
        'Living Soil & Us'
      ],
      chapters: [
        {
          kicker: 'Chapter I · The Underground Economy',
          title: 'Leaves capture sunlit sugar, while rocks lock away vital minerals',
          text: 'In the sunlit canopy, leaves use <span class="sci-term">photosynthesis</span> to turn sunlight and air into <strong>sugar</strong>. Deep below, essential <strong>water, phosphorus, and nitrogen</strong> sit locked inside microscopic rock pores that only hair-fine fungal <span class="sci-term">hyphae</span> can enter.',
          mission: 'Inspect the underground root network'
        },
        {
          kicker: 'Chapter II · The Cellular Handshake',
          title: 'Fungi trade rock minerals for tree sugar right at the root wall',
          text: 'Fungal threads unlock rock minerals and form a <span class="sci-term">mycorrhiza</span> with roots. Depending on the fungus, <span class="sci-term">ectomycorrhizal</span> threads wrap around the outer walls of root cells (common in forest trees), while <span class="sci-term">arbuscular</span> threads press gently inside root cell walls (common in farm crops), trading water and <strong>minerals</strong> for golden sugar.',
          mission: 'Examine the root-cell handshake up close'
        },
        {
          kicker: 'Chapter III · Neighborhood Bridges',
          title: 'Shared fungal bridges move carbon between sunlit and shaded trees',
          text: 'Field studies worldwide using <span class="sci-term">carbon isotopes</span> have tracked sugar moving underground through shared <span class="sci-term">mycelium</span> between neighboring trees, even across species like fir and birch. Extra sugar from sunlit crowns flows along fungal bridges toward <strong>shaded seedlings</strong> on the dim forest floor.',
          mission: ''
        },
        {
          kicker: 'Chapter IV · Early Defense Signals',
          title: 'Pest-damaged plants pass chemical warnings across fungal threads',
          text: 'When leaf-eating insects chew on the Elder Fir, chemical stress cues move into its roots and cross shared fungal bridges within 24 to 48 hours. Connected neighbors like the <strong>Paper Birch</strong> detect the alert and brew protective <span class="sci-term">tannins</span> in their leaves before pests spread.',
          mission: 'Trigger insect attack & watch the signal'
        },
        {
          kicker: 'Chapter V · Parasites on the Network',
          title: 'Some pale forest plants live as parasites on the fungal web',
          text: 'Notice the waxy white <strong>Ghost Pipe</strong> on the right. Completely lacking green <span class="sci-term">chlorophyll</span>, it makes zero food from sunlight. Instead, it evolved into a <span class="sci-term">mycoheterotroph</span>, attaching to living fungal threads like a parasite to draw tree sugar without giving anything back.',
          mission: 'Inspect the parasitic Ghost Pipe'
        },
        {
          kicker: 'Chapter VI · Living Soil & Our Food',
          title: 'Chemicals break a 400-million-year pact, while living soil restores it',
          text: 'The earliest land plants had <strong>no roots at all</strong>; they lived in total <span class="sci-term">symbiosis</span> with fungi, and roots evolved to expand that bond. Chemical pesticides kill delicate fungi, while synthetic fertilizers give plants free surface minerals so they stop paying sugar and sever the connection. Stripped of fungi’s deep mineral reach, soils lose fertility and food prices climb. <span class="sci-term">Regenerative</span> care restores living soil.',
          missionShock: 'Test chemical fertilizer shock on the web',
          missionRestore: 'Restore living regenerative soil',
          toastShock: 'Connection severed: plants stopped paying fungi under chemical inputs',
          toastRestore: 'Living soil restored: deep mineral and sugar exchange resumes'
        }
      ],
      organisms: {
        fir: {
          title: 'Elder Fir',
          tag: 'Mature hub tree',
          what: 'A towering sunlit evergreen linked into dozens of neighbors through deep roots and shared fungal threads.',
          gives: 'Up to 30% of its sunlit carbon sugar into the underground fungal network',
          gets: 'Deep rock water, phosphorus, nitrogen, and trace minerals at its root tips'
        },
        sapling: {
          title: 'Shaded Sapling',
          tag: 'Understory seedling',
          what: 'A young evergreen growing beneath dense canopy shade where scarce direct sunlight reaches.',
          gives: 'A future sunlit sugar-supplying partner once it reaches the upper canopy',
          gets: 'Supplemental carbon sugar and rock minerals routed across shared fungal bridges'
        },
        birch: {
          title: 'Paper Birch',
          tag: 'Broadleaf neighbor',
          what: 'A completely different tree species connected into the very same underground fungal web.',
          gives: 'Summer leaf-sugar surpluses into the shared underground network',
          gets: 'Early insect-attack warning cues and deep rock minerals'
        },
        mycelium: {
          title: 'Mycelium Web',
          tag: 'The living network',
          what: 'Mycelium (noun: the underground thread body of a fungus) stretches for miles 50 times finer than hair. Mushrooms aren’t just food, they are only its seasonal fruit.',
          gives: 'Water and trace minerals dissolved from microscopic rock pores roots cannot enter',
          gets: 'Sunlit plant sugar, since fungi lack green leaves to make food from light'
        },
        ghost: {
          title: 'Ghost Pipe',
          tag: 'Parasitic forest plant',
          what: 'A waxy white plant lacking chlorophyll (noun: green pigment that captures sunlight), surviving as a parasite on the fungal web.',
          gives: 'Nothing in return, because it makes zero food from sunlight',
          gets: 'Tree sugar drawn directly out of living fungal threads'
        }
      },
      tablets: [
        {
          title: 'Mushrooms aren’t just food, they’re only the fruit',
          body: 'Nearly the entire fungus lives underground as miles of threads weaving tree roots together, while mushrooms are only its seasonal fruit.'
        },
        {
          title: 'Sugar trades for rock minerals',
          body: 'Trees pay fungi with sunlit carbon sugar; fungi wrap around or reach inside root cells to pay back deep water, nitrogen, and phosphorus.'
        },
        {
          title: 'One web links the neighborhood',
          body: 'Shared fungal bridges let extra sugar reach shaded seedlings and carry chemical bug-attack warnings between neighboring trees.'
        },
        {
          title: 'Living soil feeds our future',
          body: 'Chemical fertilizers and pesticides rupture this 400-million-year partnership and exhaust farmland; regenerative soil care restores it.'
        }
      ],
      riddles: [
        {
          q: 'Do big trees “think” like brains when feeding shaded seedlings?',
          a: 'No brains required. Sugar naturally moves from sunlit, sugar-rich crowns toward shaded, hungry roots, and keeping young neighbors alive preserves future partners for the shared fungal web.'
        },
        {
          q: 'What happens if a plant or fungus tries to shortchange the deal?',
          a: 'Both sides bargain like an honest market: fungi route more rock minerals toward generous sugar-paying roots, while plants pinch off sugar to root tips where fungi hoard nutrients.'
        },
        {
          q: 'How fast do underground bug-attack warnings travel?',
          a: 'Roughly <strong>24 to 48 hours</strong>, far slower than animal nerves, yet plenty fast enough to beat leaf-eating insects moving from tree to tree.'
        },
        {
          q: 'Why do chemical fertilizers and pesticides ruin soil fertility over time?',
          a: 'Over 400 million years ago, the first land plants had <strong>no roots at all</strong>. Fungi fed them, and roots evolved to expand that bond. Chemical pesticides harm delicate fungal threads, while synthetic fertilizers give plants free surface minerals so they stop paying sugar and break the partnership. Without fungi unlocking deep trace minerals and holding soil together, land degrades and food costs rise, which is why <strong>organic, regenerative farming</strong> is vital for our future.'
        }
      ]
    }
  };

  const LORE_NAMES = {
    'step-0': 'Leaves & Rocks',
    'step-1': 'The Root Handshake',
    'step-2': 'Neighborhood Bridges',
    'step-3': 'Bug-Attack Warnings',
    'step-4': 'The Ghost Plant',
    'step-5': 'Living Soil & Us',
    'pin-fir': 'Elder Fir',
    'pin-sapling': 'Shaded Sapling',
    'pin-birch': 'Paper Birch',
    'pin-mycelium': 'Mycelium Web',
    'pin-ghost': 'Ghost Pipe'
  };

  const RANKS = [
    [11, 'Forest Whisperer'],
    [8, 'Mycelium Seer'],
    [4, 'Root Ranger'],
    [0, 'Sprout Scout']
  ];

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

  // yaw, pitch, distance, look-at target, lens FOV
  const STEP_CAMERAS = [
    { yaw: 0.11, pitch: 0.14, dist: 12.0, target: [0.0, -0.22, 0.0], fov: 35 },
    { yaw: -0.3, pitch: -0.05, dist: 6.1, target: [-1.22, -1.52, 0.42], fov: 28 },
    { yaw: 0.15, pitch: 0.1, dist: 7.9, target: [-0.2, -0.38, 0.22], fov: 32 },
    { yaw: -0.15, pitch: 0.17, dist: 11.1, target: [0.05, -0.18, 0.0], fov: 37 },
    { yaw: 0.54, pitch: 0.12, dist: 6.5, target: [2.52, -0.28, 0.7], fov: 29 },
    { yaw: -0.24, pitch: 0.06, dist: 10.8, target: [-0.05, -0.62, 0.1], fov: 35 }
  ];

  const NAMED_CAMERAS = {
    cutaway: STEP_CAMERAS[0],
    underground: { yaw: -0.2, pitch: -0.14, dist: 7.6, target: [0.0, -1.68, 0.0], fov: 33 },
    top: { yaw: 0.24, pitch: 0.76, dist: 12.2, target: [0.0, 0.25, 0.0], fov: 36 },
    ghost: STEP_CAMERAS[4]
  };

  const TITLE_POSE = { yaw: 0.3, pitch: 0.15, dist: 12.4, target: [0.15, -0.15, 0.0], fov: 35 };

  // ===========================================================================
  // 2. DOM
  // ===========================================================================
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const mobileQuery = matchMedia('(max-width: 760px)');

  const game = $('#game');
  const canvas = $('#world');
  const titleScreen = $('#title-screen');
  const titleSub = $('#title-sub');
  const menuMain = $('#menu-main');
  const menuChapters = $('#menu-chapters');
  const hudTop = $('#hud-top');
  const hudBottom = $('#hud-bottom');
  const journal = $('#journal');
  const journalBody = $('#journal-body');
  const journalToggle = $('#journal-toggle');
  const pinsLayer = $('#pins');
  const pins = $$('.pin');
  const tabs = $$('.chapter-path [role="tab"]');
  const panels = $$('.panels [role="tabpanel"]');
  const chapterPath = $('.chapter-path');
  const stepCounter = $('#step-counter');
  const prevBtn = $('#prev-step-btn');
  const nextBtn = $('#next-step-btn');
  const timeBtn = $('#time-toggle');
  const timeLabel = $('#time-label');
  const sfxBtns = $$('#sfx-toggle, #title-sfx-toggle');
  const motionBtn = $('#motion-toggle');
  const sockets = $$('#rune-sockets li');
  const loreCount = $('#lore-count');
  const loreRank = $('#lore-rank');
  const loreProgress = $('#lore-progress');
  const toasts = $('#toasts');
  const liveStatus = $('#sim-live-status');
  const viewBtns = $$('.view-btn[data-cam]');
  const xrayBtn = $('#soil-xray-btn');
  const codex = $('#codex');
  const closeup = $('#closeup-dialog');
  const closeupCaption = $('#closeup-caption');
  const lensBtn = $('#dialog-lighting-btn');
  const lensDay = $('#closeup-img-day');
  const lensNight = $('#closeup-img-night');
  const slider = $('#sunlight-slider');
  const sliderOut = $('#sunlight-readout');
  const soilShockBtn = $('#toggle-soil-shock-btn');
  const ageInputs = $$('.age-picker input[type="radio"]');
  const sciDicts = $$('.sci-dict');
  const chapterSources = $$('.chapter-sources');
  const researchShelf = $('#research-shelf');
  const engineStatus = $('#engine-status');

  let savedAge = 'adults';
  try {
    const raw = localStorage.getItem(AGE_STORAGE_KEY);
    if (raw && raw in AGE_MODES) savedAge = raw;
  } catch (_) { /* storage unavailable */ }

  const state = {
    screen: 'title',
    age: savedAge,
    step: 0,
    started: false,
    night: true,
    paused: false,
    journalOpen: true,
    soilShock: false,
    discovered: new Set(),
    layout: { W: 0, H: 0, hudH: 0, bottomH: 0, journal: null }
  };

  let engine = null;
  let lastPin = null;
  const sfx = typeof window.createForestSfx === 'function' ? window.createForestSfx() : null;

  function syncSfxButtons() {
    const on = !sfx?.isMuted();
    for (const b of sfxBtns) b.setAttribute('aria-pressed', String(on));
  }
  for (const b of sfxBtns) {
    b.addEventListener('click', () => {
      sfx?.toggleMuted();
      syncSfxButtons();
    });
  }

  // ===========================================================================
  // 2b. Audience age adaptation (Under 12 · Teens · Adults)
  // ===========================================================================
  function syncSoilShockBtn() {
    if (!soilShockBtn) return;
    const ch6 = AGE_MODES[state.age].chapters[5];
    soilShockBtn.setAttribute('aria-pressed', String(state.soilShock));
    soilShockBtn.classList.toggle('quest-action--danger', !state.soilShock);
    soilShockBtn.classList.toggle('quest-action--restore', state.soilShock);
    const txt = soilShockBtn.querySelector('.quest-action-text');
    if (txt) txt.textContent = state.soilShock ? ch6.missionRestore : ch6.missionShock;
  }

  function applyAgeMode(mode, { playSfx = false, announce = false } = {}) {
    if (!(mode in AGE_MODES)) return;
    state.age = mode;
    try {
      localStorage.setItem(AGE_STORAGE_KEY, mode);
    } catch (_) { /* ignore */ }

    for (const inp of ageInputs) inp.checked = inp.value === mode;

    const copy = AGE_MODES[mode];
    const isAdults = mode === 'adults';

    if (titleSub) titleSub.textContent = copy.titleSub;

    // Chapter select menu items
    copy.menuChapters.forEach((label, idx) => {
      const el = $(`[data-chapter-menu="${idx}"]`);
      if (el) el.textContent = label;
    });

    // Pin visible labels
    for (const pin of pins) {
      const info = copy.organisms[pin.dataset.pin];
      const lbl = pin.querySelector('.pin-label');
      if (info && lbl) lbl.textContent = info.title;
    }

    // All 6 Quest Journal panels
    copy.chapters.forEach((ch, idx) => {
      const panel = $(`[data-chapter-panel="${idx}"]`);
      if (!panel) return;
      const kicker = panel.querySelector('.chapter-kicker');
      const title = panel.querySelector('.chapter-title');
      const text = panel.querySelector('.chapter-text');
      if (kicker) kicker.textContent = ch.kicker;
      if (title) title.textContent = ch.title;
      if (text) text.innerHTML = ch.text;
      if (idx < 5 && ch.mission) {
        const mText = panel.querySelector('.quest-action-text');
        if (mText) mText.textContent = ch.mission;
      }
    });
    const sunQuestLabel = $('#sun-quest-label');
    const sunSliderLabel = $('#sun-slider-label');
    if (sunQuestLabel) sunQuestLabel.textContent = copy.sunQuestLabel;
    if (sunSliderLabel) sunSliderLabel.textContent = copy.sunSliderLabel;
    syncSoilShockBtn();

    // Adult-only pocket dictionary entries & peer-reviewed research links
    for (const dict of sciDicts) dict.hidden = !isAdults;
    for (const src of chapterSources) src.hidden = !isAdults;
    if (researchShelf) researchShelf.hidden = !isAdults;

    // Spirit lens modal
    if (closeupCaption) closeupCaption.innerHTML = copy.closeupCaption;

    // Refresh open codex popover if visible
    if (lastPin) {
      const key = lastPin.dataset.pin;
      const info = copy.organisms[key];
      if (info) {
        $('#codex-tag').textContent = lastPin.classList.contains('is-discovered') ? info.tag : `Codex entry unlocked · ${info.tag}`;
        $('#codex-title').textContent = info.title;
        $('#codex-what').textContent = info.what;
        $('#codex-gives').textContent = info.gives;
        $('#codex-gets').textContent = info.gets;
        if (codex.matches?.(':popover-open')) placeCodex();
      }
    }

    // Lore tablets & Campfire riddles
    const loreHeading = $('#lore-heading');
    const loreSub = $('#lore-sub');
    if (loreHeading) loreHeading.textContent = copy.loreHeading;
    if (loreSub) loreSub.textContent = copy.loreSub;
    copy.tablets.forEach((tab, idx) => {
      const card = $(`[data-lore-tablet="${idx}"]`);
      if (!card) return;
      const h3 = card.querySelector('h3');
      const p = card.querySelector('p');
      if (h3) h3.textContent = tab.title;
      if (p) p.textContent = tab.body;
    });

    const riddlesHeading = $('#riddles-heading');
    const riddlesSub = $('#riddles-sub');
    if (riddlesHeading) riddlesHeading.textContent = copy.riddlesHeading;
    if (riddlesSub) riddlesSub.textContent = copy.riddlesSub;
    copy.riddles.forEach((r, idx) => {
      const det = $(`[data-riddle="${idx}"]`);
      if (!det) return;
      const q = det.querySelector('.riddle-q');
      const a = det.querySelector('.riddle-answer p');
      if (q) q.textContent = r.q;
      if (a) a.innerHTML = r.a;
    });

    if (playSfx) sfx?.ageSwitch(mode);
    if (announce) {
      if (state.screen === 'play') {
        toast({ kind: 'lore', kicker: 'Audience mode', text: copy.badge, duration: 2600 });
      }
      liveStatus.textContent = `Explanation adapted for ${copy.badge}.`;
    }
    measureLayout();
    updateInsets();
  }

  for (const inp of ageInputs) {
    inp.addEventListener('change', () => {
      if (inp.checked) applyAgeMode(inp.value, { playSfx: true, announce: true });
    });
  }
  for (const el of $$('.age-pill, .sources-list a, .research-card')) {
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') sfx?.hover();
    });
  }

  // ===========================================================================
  // 3. Screens: title <-> play
  // ===========================================================================
  function setScreen(screen) {
    state.screen = screen;
    game.dataset.screen = screen;
    const playing = screen === 'play';
    titleScreen.inert = playing;
    for (const el of [hudTop, journal, hudBottom, pinsLayer]) el.inert = !playing;
    engine?.setAttract(!playing && !reducedMotionQuery.matches);
    sfx?.updateWorld({ screen });
    if (!playing && codex.matches?.(':popover-open')) codex.hidePopover();
    measureLayout();
    updateInsets();
  }

  function startQuest(chapter = 0) {
    sfx?.questBegin();
    setScreen('play');
    if (!state.started) {
      state.started = true;
      setNight(false, { silent: true }); // dawn breaks as the quest begins
    }
    activateStep(chapter, { duration: 2.9, fromTitle: true });
    journal.focus({ preventScroll: true });
  }

  function showTitle() {
    sfx?.menuBack();
    setScreen('title');
    showMenu('main');
    engine?.flyTo(TITLE_POSE, { duration: 2.2 });
    menuMain.querySelector('.menu-item')?.focus({ preventScroll: true });
  }

  function showMenu(which) {
    menuMain.hidden = which !== 'main';
    menuChapters.hidden = which !== 'chapters';
    const list = which === 'main' ? menuMain : menuChapters;
    list.querySelector('.menu-item')?.focus({ preventScroll: true });
  }

  for (const item of $$('.menu-item', titleScreen)) {
    item.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') sfx?.hover();
    });
  }

  titleScreen.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (!item) return;
    const action = item.dataset.action;
    if (action === 'begin') startQuest(0);
    else if (action === 'chapters') { sfx?.menuSelect(); showMenu('chapters'); }
    else if (action === 'back') { sfx?.menuBack(); showMenu('main'); }
    else if (action === 'lore') { sfx?.menuSelect(); $('#lore').scrollIntoView({ behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' }); }
    else if (item.dataset.chapter) startQuest(Number(item.dataset.chapter));
  });

  // Arrow keys move through the menu; Enter starts the quest
  document.addEventListener('keydown', (e) => {
    if (state.screen !== 'title' || e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
    const gameRect = game.getBoundingClientRect();
    if (gameRect.bottom < 120) return; // scrolled away to the lore section
    if (e.target?.closest?.('.age-picker')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        startQuest(0);
      }
      return;
    }
    const items = $$('.menu-list:not([hidden]) .menu-item');
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      items[idx < 0 ? 0 : (idx + dir + items.length) % items.length].focus();
      sfx?.hover();
    } else if (e.key === 'Enter' && idx < 0 && (document.activeElement === document.body || !document.activeElement)) {
      e.preventDefault();
      startQuest(0);
    } else if (e.key === 'Escape' && !menuChapters.hidden) {
      sfx?.menuBack();
      showMenu('main');
    }
  });

  $('#menu-btn').addEventListener('click', showTitle);

  // ===========================================================================
  // 4. Lore meter, ranks & toasts
  // ===========================================================================
  const MAX_RUNES = sockets.length;
  const rankFor = (n) => RANKS.find(([min]) => n >= min)[1];

  function toast({ kind = 'lore', kicker, text, duration = 3200 }) {
    while (toasts.children.length > 2) toasts.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    el.innerHTML = '<span class="toast-gem" aria-hidden="true"></span><span><span class="toast-kicker"></span><span class="toast-text"></span></span>';
    el.querySelector('.toast-kicker').textContent = kicker;
    el.querySelector('.toast-text').textContent = text;
    toasts.append(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), reducedMotionQuery.matches ? 0 : 420);
    }, duration);
  }

  function unlockLore(id, { sfxDelay = 0 } = {}) {
    if (state.discovered.has(id)) return;
    const before = rankFor(state.discovered.size);
    state.discovered.add(id);
    const n = state.discovered.size;
    loreCount.textContent = String(n);
    loreProgress.value = n;

    const socket = sockets.find((li) => li.dataset.lore === id);
    if (socket) {
      socket.classList.add('is-lit', 'is-new');
      setTimeout(() => socket.classList.remove('is-new'), 1000);
    }

    const isCodex = id.startsWith('pin-');
    const loreLabel = isCodex
      ? AGE_MODES[state.age].organisms[id.slice(4)]?.title || LORE_NAMES[id]
      : AGE_MODES[state.age].menuChapters[Number(id.slice(5))] || LORE_NAMES[id];
    sfx?.loreUnlock(isCodex, { delay: sfxDelay });
    toast({ kind: isCodex ? 'codex' : 'lore', kicker: isCodex ? 'Codex entry found' : 'Lore discovered', text: loreLabel });

    const after = rankFor(n);
    loreRank.textContent = after;
    if (after !== before) {
      setTimeout(() => {
        sfx?.rankUp(n === MAX_RUNES);
        toast({ kind: 'rank', kicker: n === MAX_RUNES ? 'All eleven runes awakened' : 'Rank up', text: after, duration: 4200 });
      }, 650);
      liveStatus.textContent = `New rank: ${after}.`;
    }
  }

  // ===========================================================================
  // 5. Quest journal
  // ===========================================================================
  function activateStep(index, { focusTab = false, duration, fromTitle = false } = {}) {
    const i = Math.max(0, Math.min(tabs.length - 1, index));
    state.step = i;
    state.soilShock = false;
    syncSoilShockBtn();
    if (!fromTitle) sfx?.chapterSelect(i);

    tabs.forEach((tab, k) => {
      const selected = k === i;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) tab.classList.add('is-visited');
    });
    panels.forEach((panel, k) => {
      const active = k === i;
      panel.hidden = !active;
      if (active) {
        panel.tabIndex = 0;
        panel.classList.remove('is-entering');
        void panel.offsetWidth;
        panel.classList.add('is-entering');
      } else {
        panel.removeAttribute('tabindex');
      }
    });
    $('.panels').scrollTop = 0;
    chapterPath.style.setProperty('--path-progress', String(i / (tabs.length - 1)));
    stepCounter.textContent = `Chapter ${ROMAN[i]} of ${ROMAN[tabs.length - 1]}`;
    prevBtn.disabled = i === 0;
    nextBtn.innerHTML = i === tabs.length - 1 ? 'Lore tablets <span aria-hidden="true">↓</span>' : 'Next <span aria-hidden="true">›</span>';
    if (focusTab) tabs[i].focus();

    engine?.setStep(i);
    setActiveView(null);
    engine?.flyTo(STEP_CAMERAS[i], duration ? { duration } : undefined);
    if (i === 3) launchAttack(false, { sfxDelay: fromTitle ? 620 : 340 });

    unlockLore(`step-${i}`, { sfxDelay: fromTitle ? 0.42 : 0.16 });
    if (mobileQuery.matches) requestAnimationFrame(updateInsets);
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => activateStep(Number(tab.dataset.step))));

  chapterPath.addEventListener('keydown', (e) => {
    const idx = tabs.indexOf(document.activeElement);
    if (idx < 0) return;
    const map = { ArrowRight: idx + 1, ArrowLeft: idx - 1, Home: 0, End: tabs.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    activateStep((map[e.key] + tabs.length) % tabs.length, { focusTab: true });
  });

  prevBtn.addEventListener('click', () => activateStep(state.step - 1));
  nextBtn.addEventListener('click', () => {
    if (state.step === tabs.length - 1) {
      sfx?.stoneClick(1.08);
      $('#lore').scrollIntoView({ behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' });
    } else {
      activateStep(state.step + 1);
    }
  });

  journalToggle.addEventListener('click', () => {
    state.journalOpen = !state.journalOpen;
    sfx?.journalToggle(state.journalOpen);
    journalToggle.setAttribute('aria-expanded', String(state.journalOpen));
    journalToggle.querySelector('.journal-toggle-text').textContent = state.journalOpen ? 'Hide' : 'Show';
    journalBody.hidden = !state.journalOpen;
    game.classList.toggle('is-journal-collapsed', !state.journalOpen);
    measureLayout();
    updateInsets();
  });

  function completeQuest(btn) {
    if (!btn || btn.classList.contains('is-done')) return;
    btn.classList.add('is-done');
    const note = document.createElement('span');
    note.className = 'visually-hidden';
    note.textContent = ' (completed)';
    btn.append(note);
  }

  // Mission: camera dives
  for (const btn of $$('[data-goto-cam]')) {
    btn.addEventListener('click', () => {
      const key = btn.dataset.gotoCam;
      sfx?.cameraFly(key);
      setActiveView(key);
      engine?.flyTo(NAMED_CAMERAS[key]);
      completeQuest(btn);
    });
  }

  // Mission: spirit lens
  for (const btn of $$('[data-open-closeup]')) {
    btn.addEventListener('click', () => {
      sfx?.lensOpen();
      setLensNight(state.night);
      closeup.showModal();
      completeQuest(btn);
    });
  }

  // Mission: sunlight
  function syncSlider() {
    const v = Number(slider.value);
    const pct = ((v - Number(slider.min)) / (Number(slider.max) - Number(slider.min))) * 100;
    slider.style.setProperty('--p', `${pct}%`);
    slider.setAttribute('aria-valuetext', `${v}% canopy sunlight`);
    sliderOut.textContent = `${v}%`;
    engine?.setSunlight(v / 100);
    sfx?.updateWorld({ sunlight: v / 100 });
    return pct / 100;
  }
  slider.addEventListener('input', () => {
    const pct01 = syncSlider();
    sfx?.sunlightSlide(pct01);
  });
  syncSlider();

  // Mission: caterpillar attack
  let attackSfxTimer = null;
  function launchAttack(fromButton = true, { sfxDelay = 0 } = {}) {
    clearTimeout(attackSfxTimer);
    if (sfxDelay > 0) attackSfxTimer = setTimeout(() => sfx?.caterpillarAttack(), sfxDelay);
    else sfx?.caterpillarAttack();
    engine?.triggerAttack();
    liveStatus.textContent = 'Caterpillars are biting the Elder Fir! An amber warning signal races down its roots and across the fungal web toward the Paper Birch.';
    if (fromButton) toast({ kind: 'alarm', kicker: 'Caterpillar attack', text: 'The warning races through the fungal web…' });
  }
  $('#trigger-attack-btn').addEventListener('click', (e) => {
    launchAttack(true);
    completeQuest(e.currentTarget);
  });

  function onAttackArrived() {
    sfx?.attackArrived();
    liveStatus.textContent = 'The warning reached the Paper Birch! Its leaves glow emerald as it brews bitter natural bug-repellent.';
    if (state.step === 3) toast({ kind: 'alarm', kicker: 'Warning delivered', text: 'The birch brews bitter bug-repellent' });
  }

  // Mission: Chapter VI chemical fertilizer shock vs. living regenerative soil
  soilShockBtn?.addEventListener('click', () => {
    state.soilShock = !state.soilShock;
    sfx?.soilShock(state.soilShock);
    engine?.setSoilDisrupted(state.soilShock);
    syncSoilShockBtn();
    const ch6 = AGE_MODES[state.age].chapters[5];
    if (state.soilShock) {
      toast({ kind: 'alarm', kicker: 'Chemical input shock', text: ch6.toastShock, duration: 3600 });
      liveStatus.textContent = ch6.toastShock;
    } else {
      completeQuest(soilShockBtn);
      toast({ kind: 'lore', kicker: 'Living soil', text: ch6.toastRestore, duration: 3600 });
      liveStatus.textContent = ch6.toastRestore;
    }
  });

  // ===========================================================================
  // 6. HUD controls
  // ===========================================================================
  function setNight(isNight, { silent = false } = {}) {
    state.night = isNight;
    if (!silent) sfx?.celestialToggle(isNight);
    engine?.setNight(isNight);
    timeLabel.textContent = isNight ? 'Night' : 'Day';
    timeBtn.setAttribute('aria-label', `Time of day: ${isNight ? 'Night' : 'Day'}. Switch to ${isNight ? 'day' : 'night'}`);
    liveStatus.textContent = isNight
      ? 'The sun sets behind the treeline, the moon rises and the forest begins to glow.'
      : 'The moon sinks away and golden morning light returns to the forest.';
  }
  timeBtn.addEventListener('click', () => setNight(!state.night));

  motionBtn.addEventListener('click', () => {
    state.paused = !state.paused;
    sfx?.stoneClick(state.paused ? 0.86 : 1.12);
    sfx?.updateWorld({ paused: state.paused });
    motionBtn.setAttribute('aria-pressed', String(state.paused));
    engine?.setPaused(state.paused);
  });

  function setActiveView(name) {
    for (const b of viewBtns) b.setAttribute('aria-pressed', String(b.dataset.cam === name));
  }
  for (const b of viewBtns) {
    b.addEventListener('click', () => {
      sfx?.cameraFly(b.dataset.cam);
      setActiveView(b.dataset.cam);
      engine?.flyTo(NAMED_CAMERAS[b.dataset.cam]);
    });
  }

  xrayBtn.addEventListener('click', () => {
    const on = xrayBtn.getAttribute('aria-pressed') !== 'true';
    sfx?.xrayToggle(on);
    sfx?.updateWorld({ xray: on });
    xrayBtn.setAttribute('aria-pressed', String(on));
    engine?.setXray(on);
  });

  // Spirit lens dialog
  function setLensNight(isNight) {
    lensDay.hidden = isNight;
    lensNight.hidden = !isNight;
    lensBtn.textContent = isNight ? 'View daylight' : 'View night glow';
  }
  lensBtn.addEventListener('click', () => {
    const nextNight = lensNight.hidden;
    sfx?.lensLightToggle(nextNight);
    setLensNight(nextNight);
  });
  closeup.addEventListener('close', () => sfx?.lensClose());
  closeup.addEventListener('click', (e) => {
    if (e.target === closeup) {
      const r = closeup.getBoundingClientRect();
      const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (outside) closeup.close();
    }
  });

  // ===========================================================================
  // 7. Codex markers
  // ===========================================================================
  let switchingPin = false;
  const canPopover = typeof HTMLElement.prototype.showPopover === 'function';

  function placeCodex() {
    if (!lastPin) return;
    const r = lastPin.querySelector('.pin-mark').getBoundingClientRect();
    const w = codex.offsetWidth;
    const h = codex.offsetHeight;
    let left = r.right + 14;
    if (left + w > innerWidth - 12) left = r.left - w - 14;
    left = Math.max(12, Math.min(innerWidth - w - 12, left));
    const minTop = Math.max(12, game.getBoundingClientRect().top + state.layout.hudH + 18);
    const top = Math.max(minTop, Math.min(innerHeight - h - 12, r.top + r.height / 2 - h / 2));
    codex.style.left = `${left}px`;
    codex.style.top = `${top}px`;
  }

  codex.addEventListener('toggle', (e) => {
    if (e.newState === 'closed' && !switchingPin && state.screen === 'play') {
      sfx?.codexClose();
    }
  });

  for (const pin of pins) {
    pin.setAttribute('aria-haspopup', 'dialog');
    pin.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') sfx?.hover();
    });
    pin.addEventListener('click', () => {
      const key = pin.dataset.pin;
      const info = AGE_MODES[state.age].organisms[key];
      lastPin = pin;
      $('#codex-tag').textContent = pin.classList.contains('is-discovered') ? info.tag : `Codex entry unlocked · ${info.tag}`;
      $('#codex-title').textContent = info.title;
      $('#codex-what').textContent = info.what;
      $('#codex-gives').textContent = info.gives;
      $('#codex-gets').textContent = info.gets;
      pin.classList.add('is-discovered');
      sfx?.codexOpen(key);
      unlockLore(`pin-${key}`, { sfxDelay: 0.18 });
      if (canPopover) {
        switchingPin = true;
        if (codex.matches(':popover-open')) codex.hidePopover();
        codex.showPopover();
        switchingPin = false;
      } else {
        codex.classList.add('is-open');
      }
      placeCodex();
    });
  }
  addEventListener('resize', () => codex.matches?.(':popover-open') && placeCodex());

  // ===========================================================================
  // 8. Layout <-> 3D view insets, marker projection
  // ===========================================================================
  // Offset* values ignore the slide-in transforms, so this is the settled layout.
  function measureLayout() {
    const L = state.layout;
    L.W = game.clientWidth;
    L.H = game.clientHeight;
    L.hudH = hudTop.offsetHeight;
    L.bottomH = mobileQuery.matches ? 0 : L.H - hudBottom.offsetTop;
    L.viewBar = mobileQuery.matches ? hudBottom.offsetTop + hudBottom.offsetHeight : 0;
    L.journal = {
      left: journal.offsetLeft,
      top: journal.offsetTop,
      right: journal.offsetLeft + journal.offsetWidth,
      bottom: journal.offsetTop + journal.offsetHeight
    };
  }

  function updateInsets() {
    if (!engine) return;
    const L = state.layout;
    let ins;
    if (state.screen === 'title') {
      ins = mobileQuery.matches
        ? { left: 0, right: 0, top: L.H * 0.3, bottom: L.H * 0.3 }
        : { left: L.W * 0.4, right: 0, top: 0, bottom: 0 };
    } else if (mobileQuery.matches) {
      const sheetTop = state.journalOpen ? L.journal.top : L.H - 70;
      ins = { left: 0, right: 0, top: L.viewBar + 4, bottom: Math.max(0, L.H - sheetTop) + 6 };
    } else {
      ins = {
        left: state.journalOpen ? L.journal.right + 6 : 0,
        right: 0,
        top: L.hudH * 0.5,
        bottom: L.bottomH + 6
      };
    }
    engine.setViewInset(ins);
  }

  new ResizeObserver(() => {
    measureLayout();
    updateInsets();
  }).observe(game);
  new ResizeObserver(() => {
    measureLayout();
    if (mobileQuery.matches) updateInsets();
  }).observe(journal);

  const dial = timeBtn;
  function onFrame({ anchors, nightMix, camTargetY = -0.22, camPitch = 0.14, attackActive = false, attackProgress = 0 }) {
    dial.style.setProperty('--night', nightMix.toFixed(3));
    const underground = Math.max(0, Math.min(1, (-camTargetY - 0.25) / 1.35 * 0.75 + Math.max(0, -camPitch) * 0.8));
    sfx?.updateWorld({ nightMix, underground, attackActive, attackProgress });
    if (state.screen !== 'play') return;
    const L = state.layout;
    const j = L.journal;
    for (const pin of pins) {
      const a = anchors[pin.dataset.pin];
      const underJournal = j && a && a.x > j.left - 30 && a.x < j.right + 30 && a.y > j.top - 30 && a.y < j.bottom + 30;
      const hidden = !a || !a.visible || a.x < 24 || a.x > L.W - 24 || a.y < L.hudH + 16 || a.y > L.H - L.bottomH - 12 || (mobileQuery.matches && a.y < L.viewBar + 20) || underJournal;
      pin.classList.toggle('is-hidden', hidden);
      if (!hidden) pin.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0) translate(-50%, -19px)`;
    }
    if (lastPin && codex.matches?.(':popover-open')) placeCodex();
  }

  // ===========================================================================
  // 9. Foreground foliage (procedural silhouettes)
  // ===========================================================================
  function buildFoliage() {
    const NS = 'http://www.w3.org/2000/svg';
    const make = (tag, attrs, parent) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      parent?.append(el);
      return el;
    };
    const leafPath = (len, w) => `M0 0C${len * 0.28} ${-w} ${len * 0.72} ${-w * 0.85} ${len} 0C${len * 0.72} ${w * 0.85} ${len * 0.28} ${w} 0 0Z`;

    function defs(svg, id) {
      const d = make('defs', {}, svg);
      const g = make('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '1' }, d);
      make('stop', { offset: '0', 'stop-color': '#0c2418' }, g);
      make('stop', { offset: '1', 'stop-color': '#020806' }, g);
    }

    // Leaflets along a quadratic stem
    function frond(svg, fill, p0, p1, p2, leaf, count, droop = 1) {
      const g = make('g', { fill }, svg);
      make('path', { d: `M${p0}Q${p1} ${p2}`, fill: 'none', stroke: fill, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
      for (let i = 1; i <= count; i++) {
        const t = i / (count + 1);
        const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
        const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
        const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
        const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        const size = leaf * (1 - t * 0.7);
        for (const side of [-1, 1]) {
          make('path', { d: leafPath(size, size * 0.24), transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(ang + side * (52 + 18 * t) * droop).toFixed(1)})` }, g);
        }
      }
    }

    // Broad leaf with a curved midrib and a faint teal rim catching the forest light
    function broadLeaf(svg, fill, x, y, len, w, rot, bend = 0.12) {
      const g = make('g', { transform: `translate(${x} ${y}) rotate(${rot})` }, svg);
      const d = `M0 0C${len * 0.22} ${-w * 1.05} ${len * 0.7} ${-w * (0.95 + bend)} ${len} ${-w * bend * 2}C${len * 0.72} ${w * (0.75 - bend)} ${len * 0.25} ${w * 0.95} 0 0Z`;
      make('path', { d, fill, stroke: 'rgb(110 200 160 / 0.14)', 'stroke-width': 1.6 }, g);
      make('path', { d: `M6 0Q${len * 0.55} ${-w * bend * 1.4} ${len - 8} ${-w * bend * 2}`, fill: 'none', stroke: 'rgb(60 120 90 / 0.35)', 'stroke-width': 1.6 }, g);
    }

    function vine(svg, fill, x, len, sway, leaf) {
      const g = make('g', { fill }, svg);
      make('path', { d: `M${x} -10Q${x + sway} ${len * 0.55} ${x + sway * 0.4} ${len}`, fill: 'none', stroke: fill, 'stroke-width': 2.2 }, g);
      const n = Math.round(len / 28);
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 0.5);
        const yy = -10 + (len + 10) * t;
        const xx = x + sway * 2 * t * (1 - t) * 1.1 + sway * 0.4 * t * t;
        const s = leaf * (0.65 + 0.35 * Math.sin(k * 1.7) ** 2);
        make('path', { d: leafPath(s, s * 0.42), transform: `translate(${xx.toFixed(1)} ${yy.toFixed(1)}) rotate(${k % 2 ? 128 : 52})` }, g);
      }
    }

    const left = $('#foliage-left');
    if (left && !left.childElementCount) {
      left.setAttribute('viewBox', '0 0 440 440');
      left.setAttribute('preserveAspectRatio', 'xMinYMax meet');
      defs(left, 'leafL');
      const f = 'url(#leafL)';
      frond(left, '#0a2117', [40, 470], [150, 300], [360, 260], 52, 12, 0.9);
      frond(left, '#081b12', [-20, 460], [40, 270], [170, 110], 50, 12, 1);
      broadLeaf(left, '#0b2318', 60, 470, 300, 92, -48, 0.2);
      broadLeaf(left, f, -40, 450, 330, 108, -30, 0.16);
      broadLeaf(left, f, -10, 470, 280, 96, -70, 0.1);
      frond(left, '#030d08', [-30, 450], [10, 330], [40, 190], 40, 10, 1.1);
      broadLeaf(left, '#020806', 110, 480, 220, 72, -16, 0.22);
      for (const [x, h, r] of [[150, 120, -8], [175, 95, 6], [205, 80, 14], [230, 60, 22]]) {
        make('path', { d: `M${x} 450Q${x + r} ${450 - h * 0.6} ${x + r * 2.2} ${450 - h}Q${x + r * 0.8} ${450 - h * 0.5} ${x + 8} 450Z`, fill: '#020806' }, left);
      }
    }

    const right = $('#foliage-right');
    if (right && !right.childElementCount) {
      right.setAttribute('viewBox', '0 0 460 400');
      right.setAttribute('preserveAspectRatio', 'xMaxYMin meet');
      defs(right, 'leafR');
      const f = 'url(#leafR)';
      vine(right, '#06170f', 250, 230, -14, 30);
      vine(right, '#04110b', 318, 330, -22, 34);
      vine(right, '#06170f', 372, 260, -10, 28);
      frond(right, '#0a2117', [480, -20], [350, 30], [200, 190], 50, 12, -1);
      broadLeaf(right, f, 490, -40, 290, 92, 152, 0.18);
      broadLeaf(right, '#0b2318', 470, 30, 250, 80, 176, 0.14);
      frond(right, '#030d08', [490, 50], [400, 170], [340, 360], 40, 11, -1);
      broadLeaf(right, '#020806', 500, -10, 230, 74, 128, 0.2);
      vine(right, '#020806', 428, 380, -16, 30);
    }
  }

  canvas.addEventListener('pointerdown', () => {
    if (state.screen === 'play') sfx?.orbitGrab();
  }, { passive: true });

  for (const details of $$('.riddle, .chapter-sources')) {
    details.addEventListener('toggle', () => sfx?.riddleToggle(details.open));
  }

  for (const link of $$('.scroll-cue, .back-to-game a')) {
    link.addEventListener('click', () => sfx?.stoneClick(1.05));
  }

  // ===========================================================================
  // 10. Boot
  // ===========================================================================
  function initialUi() {
    syncSfxButtons();
    applyAgeMode(state.age);
    timeLabel.textContent = 'Night';
    timeBtn.setAttribute('aria-label', 'Time of day: Night. Switch to day');
    timeBtn.style.setProperty('--night', '1');
    setScreen('title');
    showMenuWithoutFocus();
  }

  function showMenuWithoutFocus() {
    menuMain.hidden = false;
    menuChapters.hidden = true;
  }

  async function boot() {
    buildFoliage();
    initialUi();
    measureLayout();
    try {
      if (typeof window.createForestEngine !== 'function') throw new Error('engine.js did not load');
      engine = await window.createForestEngine({
        canvas,
        sceneData: window.WOOD_WIDE_WEB_3D,
        reducedMotion: reducedMotionQuery.matches
      });
      engine.setNight(true, { instant: true });
      engine.setPose(TITLE_POSE);
      engine.setAttract(state.screen === 'title' && !reducedMotionQuery.matches);
      engine.setSunlight(Number(slider.value) / 100);
      engine.on('frame', onFrame);
      engine.on('attackArrived', onAttackArrived);
      measureLayout();
      updateInsets();
      engine.setViewInset({}, { instant: true });
      engineStatus.classList.add('is-done');
      engineStatus.textContent = '';
    } catch (err) {
      console.error('[wood-wide-web] 3D engine failed to start:', err);
      $('#world-fallback').hidden = false;
      canvas.hidden = true;
      engineStatus.classList.add('is-error');
      engineStatus.textContent = 'The live 3D forest could not load (offline, or WebGL is off). Showing the Blender render instead, and the quest still works.';
    }

    // Stop rendering while the forest is scrolled out of view
    new IntersectionObserver(([entry]) => {
      engine?.setActive(entry.isIntersecting);
      sfx?.updateWorld({ inView: entry.isIntersecting });
    }, { threshold: 0.02 }).observe(game);
  }

  reducedMotionQuery.addEventListener('change', (e) => {
    engine?.setReducedMotion(e.matches);
    engine?.setAttract(state.screen === 'title' && !e.matches);
  });
  mobileQuery.addEventListener('change', () => {
    measureLayout();
    updateInsets();
  });

  boot();
})();
