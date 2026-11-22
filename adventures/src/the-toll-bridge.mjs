// The Toll at Crookback Bridge: a short adventure for one session. `node adventures/tools/build.mjs`
// writes it to adventures/the-toll-bridge.json.
import {
  LevelBuilder,
  coins,
  envelope,
  flagEquals,
  monsters,
  narrative,
  save,
  trap,
  valuable,
  wanderingTable,
} from '../tools/lib.mjs';
import { named } from './named-monsters.mjs';

const DUNGEON = 'bridge';

const level = new LevelBuilder({
  dungeonId: DUNGEON,
  number: 1,
  mask: `
####################UUUU##
####################UUUU##
###KKK#####TTTT#####UUUU##
###KKK#####TTTT###########
###KKK#####TTTT###########
RRRRG,,,,,,,,,,,,,,,EEEFFF
RRRRG,,,,,,,,,,,,,,,EEEFFF
RRRRG,,,,,,,,,,,,,,,EEEFFF
###BBB####################
###BBB####PPP#############
###BBB####PPPLLLLLL#######
XXXXX###SSPPPVVVVVVVV#####
XXXXX###SS###VVVVVVVV#####
##########################
`,
});

level
  .area('R', {
    id: 'kingsway',
    name: 'The Kingsway',
    description:
      'The old high road climbs out of the pines and runs straight at the bridge. A board nailed to a post reads TOLL in red letters a foot high. To the south-west, a goat path drops over the edge of the gorge.',
  })
  .area('G', {
    id: 'toll_gate',
    name: 'Toll gate',
    description:
      'A squat stone arch closes the west end of Crookback Bridge, and a striped pole is lowered across the road. Under the arch, three bandits in odd pieces of armour lounge on upturned barrels with cudgels across their knees. A slate by the pole reads: ONE GOLD A HEAD. NO ARGUING.',
    encounter: monsters([['bandit', 3]], { alignment: 'neutral', stance: 'indifferent' }),
  })
  .area('K', {
    id: 'kennel',
    name: 'Kennel',
    description:
      'Straw, gnawed bones, and the rank smell of animals. A lean grey wolf, bought as a cub from a trapper and kept hungry ever since, rises out of the straw with its hackles up.',
    encounter: monsters([['normal_wolf', 1]], { stance: 'attacks' }),
  })
  .area('B', {
    id: 'bunkroom',
    name: 'Bunkroom',
    description:
      'Six bunks, two of them full of snoring bandits. Boots, dice, and empty wine jugs cover the floor, and a battered sea chest sits under the window.',
    encounter: monsters([['bandit', 2]]),
    features: [
      {
        id: 'sea_chest',
        kind: 'treasure_cache',
        description: "The bandits' pooled winnings from a month of dice, and a good crossbow.",
        coins: { sp: 180, cp: 300 },
        item_ids: ['crossbow', 'crossbow_bolts'],
      },
    ],
  })
  .area('T', {
    id: 'counting_room',
    name: 'Counting room',
    description:
      'A cramped office inside the toll tower, lit by a smoking lamp. Ledgers record every toll in a neat hand. A wizened man in an ink-stained robe sits behind the desk, and a bandit with a crossbow stands at his shoulder. Beside the desk is a square trapdoor with a rope handle, and a ladder climbs to the room above.',
    encounter: monsters(
      [
        ['toll_clerk', 1],
        ['bandit', 1],
      ],
      { stance: 'indifferent' },
    ),
    features: [
      {
        id: 'toll_strongbox',
        kind: 'treasure_cache',
        description: "The week's takings, in a strongbox bolted to the floor under the desk.",
        coins: { gp: 90, sp: 240 },
        trap: trap({ kind: 'treasure', trigger: 'open', damage_dice: '1d4', save: save('death') }),
      },
    ],
  })
  .area('U', {
    id: 'captains_loft',
    name: "Captain's loft",
    description:
      'The top room of the toll tower, with arrow slits on four sides and a view down the whole gorge. Mag Corrie, who calls herself captain of the bridge, wears a mail shirt even in bed and has furnished it with a stolen carpet and a curtained bed. Her bodyguard, a huge bare-chested man with a meat cleaver, never leaves her side.',
    encounter: monsters(
      [
        ['mag_corrie', 1],
        ['mags_bodyguard', 1],
      ],
      {},
    ),
    features: [
      {
        id: 'captains_chest',
        kind: 'treasure_cache',
        description:
          "Mag Corrie's share of the tolls, a silver brooch, a well-made sword, and a small iron box with a miller's mark on the lid.",
        coins: { gp: 220 },
        item_ids: ['millers_strongbox'],
        magic_item_ids: ['sword_plus_1'],
        valuables: [valuable('jewellery', 'Silver brooch', 120)],
      },
    ],
  })
  .area('E', {
    id: 'east_gatehouse',
    name: 'East gatehouse',
    description:
      'The east end of the bridge is closed by a rusted portcullis, worked from this room by a great winch. A bandit dozes by the winch with a crossbow across his knees.',
    encounter: monsters([['bandit', 1]]),
  })
  .area('F', {
    id: 'far_road',
    name: 'The far road',
    description:
      'Beyond the east gate, the Kingsway runs on into the hills toward the lowland towns. A cart with a broken axle stands at the roadside, long since emptied.',
  })
  .area('P', {
    id: 'pier_undercroft',
    name: 'Pier undercroft',
    description:
      'A dark chamber inside the central pier of the bridge, reached by an iron ladder from the deck. The river roars somewhere below. Bats hang in the vault, and their droppings make the floor treacherous.',
    encounter: monsters([['giant_bat', 2]]),
  })
  .area('S', {
    id: 'smugglers_hole',
    name: "Smugglers' hole",
    description:
      'A dry niche cut into the pier behind a false wall of fitted stone. One of the bandits has been keeping things here that he did not want to share with the rest of the band.',
    features: [
      {
        id: 'hidden_bundle',
        kind: 'treasure_cache',
        description:
          'An oilcloth bundle tied with wire. A small crossbow mechanism is fixed to the shelf behind it, pointing out.',
        coins: { gp: 75 },
        valuables: [valuable('gem', 'Amber', 100)],
        magic_item_ids: ['potion_of_healing'],
        trap: trap({ kind: 'treasure', trigger: 'open', damage_dice: '1d3', volley_dice: '1d4' }),
      },
    ],
  })
  .area('L', {
    id: 'ledge',
    name: 'Ledge under the arch',
    description:
      'A narrow stone ledge runs along the inside of the arch, slick with spray. A few feet below, the river runs fast and white.',
  })
  .area('V', {
    id: 'river',
    name: 'The river',
    description: 'Fast, cold water, white over the rocks, and much deeper than it looked.',
  })
  .area('X', {
    id: 'shingle_beach',
    name: 'Shingle beach',
    description:
      'A beach of grey stones under the west end of the gorge, strewn with driftwood and with what is left of travellers who would not pay. A goat path climbs the cliff to the road above. Something pale and many-legged sits very still among the rocks.',
    encounter: monsters([['crab_spider', 1]]),
    features: [
      {
        id: 'drowned_pack',
        kind: 'treasure_cache',
        description: "A drowned pedlar's pack, wedged between two rocks.",
        coins: { gp: 30 },
        item_ids: ['lantern', 'oil_flask', 'oil_flask'],
      },
    ],
  });

level
  .join('R', 'G')
  .door([4, 4], 'south')
  .door([4, 7], 'south')
  .door([4, 6], 'east')
  .door([12, 4], 'south')
  .door([19, 6], 'east', { starts_open: true })
  .door([22, 6], 'east', { locked: true })
  .door([9, 11], 'east', { kind: 'secret' })
  .open([12, 10], 'east')
  .join('L', 'V')
  .transition({
    kind: 'stairs_up',
    position: [12, 4],
    to_dungeon_id: DUNGEON,
    to_level_number: 1,
    to_position: [21, 1],
    to_facing: 'south',
  })
  .transition({
    kind: 'stairs_down',
    position: [21, 1],
    to_dungeon_id: DUNGEON,
    to_level_number: 1,
    to_position: [12, 4],
    to_facing: 'south',
  })
  .transition({
    kind: 'trapdoor',
    position: [14, 3],
    to_dungeon_id: DUNGEON,
    to_level_number: 1,
    to_position: [14, 10],
    to_facing: 'west',
  })
  .transition({
    kind: 'stairs_down',
    position: [11, 7],
    to_dungeon_id: DUNGEON,
    to_level_number: 1,
    to_position: [11, 9],
    to_facing: 'south',
  })
  .transition({
    kind: 'stairs_up',
    position: [11, 9],
    to_dungeon_id: DUNGEON,
    to_level_number: 1,
    to_position: [11, 7],
    to_facing: 'north',
  })
  .transition({
    kind: 'stairs_down',
    position: [0, 7],
    to_dungeon_id: DUNGEON,
    to_level_number: 1,
    to_position: [1, 11],
    to_facing: 'east',
  })
  .transition({
    kind: 'stairs_up',
    position: [1, 11],
    to_dungeon_id: DUNGEON,
    to_level_number: 1,
    to_position: [0, 7],
    to_facing: 'east',
  });

const table = wanderingTable('crookback_bridge', 'Crookback Bridge', 1, [
  [1, 6, 'Bandits on their rounds', 'bandit', '1d4'],
  [7, 9, 'Giant bats', 'giant_bat', '1d3'],
  [10, 12, 'Wolves', 'normal_wolf', '1d2'],
  [13, 14, 'Crab spider', 'crab_spider', 1],
  [15, 18, 'Travellers waiting to cross', 'trader', '1d4'],
  [19, 20, 'Rock baboons', 'rock_baboon', '1d4'],
]);

const clause = (pattern, conditions = []) => ({ pattern, conditions });
const areaEntered = (area_id) => ({
  pattern_type: 'area_entered',
  dungeon_id: DUNGEON,
  level_number: 1,
  area_id,
});

const payload = {
  name: 'The Toll at Crookback Bridge',
  description:
    'Bandits have taken the toll tower on Crookback Bridge, and they charge whatever they like to cross the gorge. A short adventure for four to six characters of first or second level, written to be played in about an hour.',
  hooks: [
    'Reeve Odo Pell of Wethercote wants the bandits off the bridge and the east portcullis raised, so the carts can run again.',
    'Miller Aske refused to pay the toll. The bandits took his strongbox and threw his cart into the river, and he wants the box back.',
  ],
  party: { min_level: 1, max_level: 2, min_size: 4, max_size: 6 },
  town: {
    name: 'Wethercote',
    description:
      'A market village of stone barns and sheep pens at the foot of the Kingsway. Since the bandits took the bridge, no carts have come up from the lowlands, and prices in the market have doubled.',
    services: [
      "Hob Tanner's smithy: weapons, armour, and gear",
      'Wayside shrine of the Shepherd: healing, cures, and raise dead, all at high prices',
      'Old Nan Colley, gem buyer: buys gems and jewellery',
      "The Drover's Rest: beds and supper",
    ],
    travel_turns: { [DUNGEON]: 1 },
    healing_prices: { cure_light_wounds: 30, cure_serious_wounds: 120, raise_dead: 2000 },
  },
  dungeons: [
    {
      id: DUNGEON,
      name: 'Crookback Bridge',
      levels: [
        level.build({
          entrance: [1, 6],
          wandering: { chance_in_six: 1, interval_turns: 2, table },
          guidance:
            "Play the bandits as lazy and greedy rather than cruel. The toll collectors at the gate would rather take a bribe than fight, and they run when Mag Corrie falls. The clerk in the counting room is a hedge-wizard, and the players should learn that only when he casts. Mag is clever and proud. She will bargain for her life, and she will lie. The river is the bridge's real danger: anyone who steps off the ledge is swept downstream to the shingle beach. Keep things moving, because the whole adventure should fit in an hour.",
        }),
      ],
    },
  ],
  monsters: [
    named('veteran_2', {
      id: 'mag_corrie',
      name: 'Mag Corrie',
      display_name: 'Mag Corrie',
      display_name_plural: 'Mag Corries',
      family_id: 'veteran',
      intro:
        'The self-styled captain of Crookback Bridge: a hard, clever fighter who leads the toll bandits.',
      // A mail shirt and a shield, not the plate armour of the template.
      changes: { ac: 4, ac_ascending: 15 },
    }),
    named('berserker', {
      id: 'mags_bodyguard',
      name: "Mag Corrie's bodyguard",
      display_name: "Mag's bodyguard",
      display_name_plural: "Mag's bodyguards",
      family_id: 'berserker',
      intro:
        'A huge, bare-chested man with a meat cleaver who fights in a rage and never leaves the captain.',
    }),
    // The toll clerk looks like a harmless bookkeeper. His family is normal_human so that the encounter
    // panel doesn't reveal that he casts spells.
    named('medium', {
      id: 'toll_clerk',
      name: 'Toll clerk',
      display_name: 'ink-stained clerk',
      display_name_plural: 'ink-stained clerks',
      family_id: 'normal_human',
      intro:
        "The bandits' bookkeeper, a wizened hedge-wizard who passes for a clerk until he starts to cast.",
    }),
  ],
  items: [
    {
      item_type: 'gear',
      id: 'millers_strongbox',
      name: "Miller Aske's strongbox",
      cost_gp: 0,
      lot_size: 1,
      capacity_coins: null,
      combat: null,
      params: {},
      overrides_applied: [],
    },
  ],
  spells: [],
  triggers: [
    {
      id: 'pay_the_toll',
      when: areaEntered('toll_gate'),
      conditions: [],
      repeatable: false,
      consequences: [
        { command_type: 'remove_coins', source: null, character_id: '@party', coins: coins({ gp: 1 }) },
      ],
      narrative: narrative({
        fired:
          'Each member who has a gold piece loses one to the toll collectors. Members with no gold keep their purses.',
        journal:
          'Hands dart into your purses as you duck under the arch. "One gold a head," says the largest bandit, grinning. "Paid in full. Now, are you crossing or are you staying?"',
      }),
    },
    {
      id: 'portcullis_rises',
      when: areaEntered('east_gatehouse'),
      conditions: [],
      repeatable: false,
      consequences: [
        {
          command_type: 'set_door_state',
          source: null,
          dungeon_id: DUNGEON,
          level_number: 1,
          x: 22,
          y: 6,
          direction: 'east',
          open: true,
          wedged: null,
          discovered: null,
          unlocked: true,
        },
        { command_type: 'set_flag', source: null, key: 'bridge.portcullis', value: 'raised' },
      ],
      narrative: narrative({
        fired: 'The portcullis is up. It stays up unless the referee lowers it.',
        journal:
          'Someone kicks the winch pawl loose. The great wheel spins, chains rattle up through the floor, and the east portcullis rises with a shriek of rust.',
      }),
    },
    {
      id: 'swept_away',
      when: areaEntered('river'),
      conditions: [],
      repeatable: true,
      consequences: [
        { command_type: 'advance_time', source: null, n: 1, unit: 'turn' },
        {
          command_type: 'place_party',
          source: null,
          location: {
            kind: 'dungeon',
            dungeon_id: DUNGEON,
            level_number: 1,
            position: [3, 12],
            facing: 'north',
          },
        },
      ],
      narrative: narrative({
        fired: 'The river takes the party downstream to the shingle beach. A turn passes.',
        journal:
          'The current snatches you off your feet and rolls you over and over through the white water. Battered and half drowned, you wash up on a beach of grey stones below the west end of the gorge.',
      }),
    },
    {
      id: 'mag_falls',
      when: { pattern_type: 'monster_defeated', template_id: 'mag_corrie' },
      conditions: [],
      repeatable: false,
      consequences: [{ command_type: 'set_flag', source: null, key: 'bridge.captain', value: 'beaten' }],
      narrative: narrative({
        fired: 'Mag Corrie is beaten. Any bandit who meets the party from now on checks morale at once.',
        journal: 'Mag Corrie is beaten, and word of it runs along the bridge faster than you can walk.',
      }),
    },
    {
      id: 'gate_surrenders',
      when: areaEntered('toll_gate'),
      conditions: [flagEquals('bridge.captain', 'beaten')],
      repeatable: false,
      consequences: [{ command_type: 'end_encounter', source: null, outcome: 'parley', resolve_area: true }],
      narrative: narrative({
        fired:
          'The toll collectors give up without a fight. Their encounter ends and the gate is clear for good.',
        journal:
          'The toll collectors have heard about their captain. They throw down their cudgels, lift the pole for you, and run for the trees.',
      }),
    },
  ],
  quests: [
    {
      id: 'open_the_kingsway',
      name: 'Open the Kingsway',
      activation: null,
      objectives: [
        {
          id: 'beat_mag_corrie',
          name: 'Beat Mag Corrie',
          when: clause({ pattern_type: 'monster_defeated', template_id: 'mag_corrie' }),
          hidden: false,
          reveal_when: null,
          narrative: narrative({ progress: 'The captain of the bridge has lost her bridge.' }),
        },
        {
          id: 'raise_portcullis',
          name: 'Raise the east portcullis',
          when: clause({ pattern_type: 'flag_set', key: 'bridge.portcullis', value: 'raised' }),
          hidden: false,
          reveal_when: null,
          narrative: narrative({ progress: 'The east portcullis stands open, and the road runs through.' }),
        },
      ],
      rewards: [
        { command_type: 'grant_coins', source: null, character_id: '@party', coins: coins({ gp: 25 }) },
        { command_type: 'award_xp', source: null, character_id: '@party', amount: 150 },
      ],
      completion: 'all',
      concludes_adventure: true,
      narrative: narrative({
        offer:
          'Reeve Odo Pell wants Crookback Bridge back. Drive off the bandits, beat their captain, and raise the east portcullis so the carts can cross.',
        completion:
          'By evening the first carts are rolling over Crookback Bridge, and the drovers cheer you all the way down to Wethercote. The reeve pays out of his own purse.',
        speaker: 'Reeve Odo Pell',
      }),
    },
    {
      id: 'millers_strongbox',
      name: "Miller Aske's strongbox",
      activation: null,
      objectives: [
        {
          id: 'find_strongbox',
          name: 'Find the strongbox',
          when: clause({ pattern_type: 'item_acquired', item_id: 'millers_strongbox' }),
          hidden: false,
          reveal_when: null,
          narrative: narrative({ progress: "The miller's mark is on the lid, and the box is still locked." }),
        },
      ],
      rewards: [
        { command_type: 'grant_coins', source: null, character_id: '@first', coins: coins({ gp: 50 }) },
        { command_type: 'award_xp', source: null, character_id: '@party', amount: 50 },
      ],
      completion: 'any',
      concludes_adventure: false,
      narrative: narrative({
        offer:
          'Miller Aske promises 50 gp to whoever brings back the strongbox the bandits took as his toll.',
        completion:
          "Tucked into the strap of the strongbox is a note in the miller's hand: FOR THE FINDER. It is wrapped around fifty gold pieces.",
        speaker: 'Miller Aske',
      }),
    },
  ],
};

export const file = 'the-toll-bridge.json';
export const document = envelope(payload);
