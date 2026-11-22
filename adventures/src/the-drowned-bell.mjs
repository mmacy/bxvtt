// The Drowned Bell: the flagship introductory adventure. `node adventures/tools/build.mjs` writes it
// to adventures/the-drowned-bell.json.
import {
  LevelBuilder,
  coins,
  envelope,
  flagEquals,
  gate,
  hasItem,
  monsters,
  narrative,
  save,
  transition,
  trap,
  valuable,
  wanderingTable,
} from '../tools/lib.mjs';
import { named } from './named-monsters.mjs';

const DUNGEON = 'priory';

// Level 1: the undercroft beneath the ruined cloister.
const level1 = new LevelBuilder({
  dungeonId: DUNGEON,
  number: 1,
  mask: `
##############################
##############################
##NNNN###YYYY########~~~BBBB##
##NNNN,,,YYYYYY##LLL#~##BBBBB#
##NNNN##,YYYYYY##LLL~~##BBBBB#
########,YYYYYY##LLL#####BBBB#
#ZZZ,,,,,###,#####,######BBB##
#ZZZ####,###,#####,######^####
########..............###^####
#RRRRRR#.###,########.^^^^####
#RRRRRR#.##HHHH#PPPP#.########
#RRRRRR,.#HHHHHHPPPP#.#DDDDDD#
#RRRRRR#.#HHHHHHPPPP#.#DDDDDD#
#RRRRRR#.#HHHHHHPPPP#.,DDDDDD#
#KKKKK##.##HHHH#PPPP#.#DDDDDD#
#KKKKK##..............#DDDDDD#
#KKKKK,,..............##WWWWW#
#KKKKK########,#########WWWWW#
#KKKKK######GGGGG#######WWWWW#
#SSSS#######GGGGG;;;;;;;WWWWW#
#SSSS#######GGGGG###;#########
#SSSS########AAA####;OOOOOOO##
#SSSS########AAA####;OOOOOOO##
#############AAA#####OOOOOOO##
##############################
`,
});

// Level 2: the crypts.
const level2 = new LevelBuilder({
  dungeonId: DUNGEON,
  number: 2,
  mask: `
##############################
##############################
##NNN#EEEEEEEEEEEE##VVVVV#FFF#
##NNN,EEEEEEEEEEEE,,VVVVV,FFF#
##NNN#EEEEEEEEEEEE##VVVVV#FFF#
###,#######,########VVVVV#UUU#
###,#######,##########,###UUU#
###,#######,##########,###UUU#
###,#######,##########,###UUU#
#XXXX######,##########,####,##
#XXXX######,##########,####,##
#XXXX######,##########,####,##
#XXXX........TT.............##
#####........TT.............##
#####,#########,###,#####,####
#####,########MMM#YYY####,GGG#
##WWWWW#######MMM#YYY####,GGG#
##WWWWW,QQQQQ,MMM#YYY####,####
##WWWWW#QQQQQ#MMM#YYY###OOOOO#
##WWWWW#QQQQQ######,####OOOOO#
########QQQQQ#####KKKKK#OOOOO#
##################KKKKK,OOOOO#
##################KKKKK#OOOOO#
##################KKKKK#OOOOO#
##############################
`,
});

// Level 3: the drowned belfry.
const level3 = new LevelBuilder({
  dungeonId: DUNGEON,
  number: 3,
  mask: `
##############################
##############################
##############################
##############################
##############################
##############################
########NNNNNNNNN#############
########NNNNNNNNN#############
###CCCC#NN#NNN#NN#############
###CCCC,NNNNNNNNN#############
###CCCC#NN#NNN#NN#############
####,###NNNNNNNNN#############
####,###NNNNNNNNN,,,##########
####,########,#####,##########
####,#####HHHHHHH##,##########
##RRRR####HHHHHHH,SSS#########
##RRRR####HHHHHHH#SSS#########
##RRRR#######,####SSS#########
##RRRR#####BBBBBBB#,##########
##########BBBBBBBBB,#GGGG#####
##########BBBBBBBBB,#GGGG#####
##########BBBBBBBBB,,GGGG#####
##########BBBBBBBBB##GGGG#####
###########BBBBBBB############
##############################
`,
});

// ---------------------------------------------------------------------------------------------
// Level 1 key.

level1
  .area('A', {
    id: 'gatehouse_stair',
    name: 'Gatehouse stair',
    description:
      'A flight of worn steps runs down from the roofless gatehouse into the undercroft of the priory. A stone statue of a hooded monk lies face down across the bottom steps, broken at the knees. Lake water drips from the vault, and the air smells of reeds and old smoke. A wide archway opens to the north.',
    features: [
      {
        id: 'fallen_statue',
        kind: 'custom',
        description:
          'The statue is Saint Corvane, holding up a lantern. Someone has chipped the glass out of the lantern to see whether there was silver inside it.',
      },
    ],
  })
  .area('G', {
    id: 'guardroom',
    name: 'Guardroom',
    description:
      'Straw pallets, a cookfire built from broken pews, and a war banner nailed to the wall: a red thumbprint on grey sacking. The goblins who call themselves the Red Thumbs keep a watch here, when they remember to. Doors lead north and east.',
    encounter: monsters([['goblin', 2]]),
  })
  .area('H', {
    id: 'chapter_house',
    name: 'Chapter house',
    description:
      'An eight-sided hall where the brothers met each morning. Stone benches run around the walls under a carved frieze, and the floor is a mosaic of a lantern shining on dark water. Doors lead north and south.',
    features: [
      {
        id: 'relief_map',
        kind: 'custom',
        description:
          'Part of the frieze is a map of the Holm carved in relief: the cloister, a tall bell tower at its west end, and under them a second, smaller cloister marked with crosses for the dead. Below that, the carver cut only wavy lines.',
      },
    ],
  })
  .area('P', {
    id: 'chapel',
    name: 'Chapel of Saint Corvane',
    description:
      'A narrow chapel that the looters never reached. Dust lies thick on the altar, and two silver candlesticks still stand on it. Above the altar, an empty niche in the shape of a raised hand is lined with faded blue velvet.',
    features: [
      {
        id: 'chapel_altar',
        kind: 'treasure_cache',
        description:
          'Two silver candlesticks, two stoppered flasks of holy water, and a clay bottle wrapped in an altar cloth.',
        item_ids: ['holy_water', 'holy_water'],
        magic_item_ids: ['potion_of_healing'],
        valuables: [
          valuable('jewellery', 'Silver altar candlestick', 60, 20),
          valuable('jewellery', 'Silver altar candlestick', 60, 20),
        ],
      },
    ],
  })
  .area('R', {
    id: 'refectory',
    name: 'Refectory',
    description:
      'Long trestle tables have collapsed into heaps of black wood. Rats have gnawed the benches to stumps. A sour smell rises from a square trapdoor near the west wall, whose ladder rotted away long ago.',
    encounter: monsters([['giant_rat', '2d4']]),
  })
  .area('K', {
    id: 'kitchen',
    name: 'Kitchen',
    description:
      'Two great bread ovens gape in the south wall. The floor is littered with cracked crocks and the empty husks of beetles. Something deep in the ovens gives off a steady red glow.',
    encounter: monsters([['fire_beetle', 2]]),
  })
  .area('S', {
    id: 'cellarers_store',
    name: "Cellarer's store",
    description:
      "Casks and grain jars stand in rows under a low vault. Most are split and empty. The cellarer's lock has kept the goblins out, but not the damp.",
    treasure: { letters: [], unguarded: true },
    features: [
      {
        id: 'wine_casks',
        kind: 'custom',
        description:
          'One cask near the back still sloshes when you rock it. The wine inside has turned to vinegar.',
      },
    ],
  })
  .area('D', {
    id: 'dorter',
    name: 'Dorter',
    description:
      "The brothers' sleeping hall is now the goblins' den. Stolen nets, fish bones, and sour bedding fill the alcoves, and red thumbprints are daubed along the walls at goblin height.",
    encounter: monsters([['goblin', 4]]),
    features: [
      {
        id: 'goblin_loot',
        kind: 'treasure_cache',
        description: 'A greasy sack of coins taken from ferry passengers, most of it copper and silver.',
        coins: { sp: 340, cp: 600 },
      },
    ],
  })
  .area('W', {
    id: 'wardens_cell',
    name: "Warden's cell",
    description:
      'A cramped room with a real bed and a carved chair. Gashnak One-Ear, the hobgoblin who leads the Red Thumbs, keeps his best plunder here. An iron-bound chest stands at the foot of the bed.',
    encounter: monsters([
      ['gashnak', 1],
      ['goblin', 2],
    ]),
    features: [
      {
        id: 'iron_chest',
        kind: 'treasure_cache',
        description: 'Coins, a pale moonstone, and an old iron key whose bow is shaped like a bell.',
        item_ids: ['priors_iron_key'],
        coins: { gp: 120, ep: 40 },
        valuables: [valuable('gem', 'Moonstone', 50)],
        trap: trap({ kind: 'treasure', trigger: 'open', damage_dice: '2d4', save: save('death') }),
      },
    ],
  })
  .area('Y', {
    id: 'scriptorium',
    name: 'Scriptorium',
    description:
      'Writing desks stand in rows under a ceiling that has partly fallen in. Loose blocks hang over the room, held up by roots from the ground above. Torn pages lie pasted to the floor by damp.',
    trap: trap({ kind: 'room', trigger: 'enter', damage_dice: '1d6', save: save('paralysis') }),
    features: [
      {
        id: 'gilt_psalter',
        kind: 'treasure_cache',
        description:
          'Under a fallen desk lies a psalter with covers of gilded silver. The pages are ruined, but the covers are worth something.',
        valuables: [valuable('jewellery', 'Gilt psalter covers', 80, 30)],
      },
    ],
  })
  .area('L', {
    id: 'well_chamber',
    name: 'Well chamber',
    description:
      'A round chamber built around a wide stone well. Cold air rises from the shaft, and the walls are streaked white with droppings. Leathery things hang in clusters from the vault.',
    encounter: monsters([['stirge', 3]]),
    features: [
      {
        id: 'stirge_nest',
        kind: 'treasure_cache',
        description: 'In a crack above the well, among bones and feathers, lies a polished bloodstone.',
        valuables: [valuable('gem', 'Bloodstone', 50)],
      },
    ],
  })
  .area('B', {
    id: 'drain_warren',
    name: 'Drain Folk warren',
    description:
      'A low cave dug out of the old drains of the priory and hung with eel traps and drying fish. Small fires smoke in clay pots. The kobolds who live here are thin and frightened, and they watch you with their spears held low.',
    encounter: monsters([['kobold', 6]], { stance: 'indifferent', hoard: true }),
  })
  .area('N', {
    id: 'night_stair',
    name: 'Night stair',
    description:
      'A broad stair descends into darkness. The brothers walked down it at midnight to sing for the dead below, and their feet have worn each step hollow in the middle.',
  })
  .area('Z', {
    id: 'broken_stair',
    name: 'Broken stair',
    description:
      'A narrow service stair, slick with green slime, slants steeply down. Partway along, the steps have cracked away into a dark gap where water gurgles. A leather satchel lies on a ledge just beyond the crack.',
    trap: trap({
      kind: 'room',
      trigger: 'enter',
      affects: 'party',
      save: save('paralysis'),
      fall_feet: 10,
      transition: transition({
        kind: 'chute',
        position: [1, 7],
        to_dungeon_id: DUNGEON,
        to_level_number: 2,
        to_position: [10, 18],
        to_facing: 'north',
      }),
    }),
    features: [
      {
        id: 'lost_satchel',
        kind: 'treasure_cache',
        description:
          'A satchel of oiled leather holding a coil of rope, a few coins, and a rolled scroll in a bone case.',
        cell: [1, 7],
        item_ids: ['rope'],
        magic_item_ids: ['spell_scroll_1'],
        coins: { gp: 12 },
      },
    ],
  })
  .area('O', {
    id: 'bone_hall',
    name: 'Bone hall',
    description:
      'Skulls are stacked to the ceiling in neat rows, each with a name painted on its brow. A stair goes down at the east end. Some of the shelves are empty, and fresh bone dust lies on the floor beneath them.',
    encounter: monsters([['skeleton', 4]], { stance: 'attacks' }),
  });

level1
  // Gatehouse, guardroom, and the corridor up to the cloister walk.
  .open([13, 20], 'south')
  .open([14, 20], 'south')
  .open([15, 20], 'south')
  .door([14, 18], 'north')
  .open([14, 17], 'north')
  .door([16, 19], 'east')
  // The goblins' bolt-hole: guardroom to the warden's cell, with a branch to the bone hall.
  .door([23, 19], 'east', { kind: 'secret' })
  .door([20, 22], 'east', { stuck: true })
  // The cloister walk and the two rooms inside it.
  .door([12, 14], 'south')
  .open([12, 9], 'north')
  .door([12, 9], 'south', { stuck: true })
  .door([15, 12], 'east', { kind: 'secret' })
  .door([18, 14], 'south', {
    requires: gate(hasItem('holy_water', true), {
      refusal:
        'The bronze doors have no handle. At their foot is a dry stone font, worn smooth by pilgrims, with three words cut into its rim: POUR AND ENTER.',
      success:
        'The holy water runs away into a channel in the stone, and the bronze doors swing open with a long sigh.',
    }),
  })
  // West: refectory, kitchen, store.
  .open([7, 11], 'east')
  .door([6, 11], 'east')
  .door([3, 13], 'south')
  .door([5, 16], 'east', { starts_open: true })
  .open([7, 16], 'east')
  .door([2, 18], 'south', { locked: true })
  // East: the dorter and the warden's cell.
  .open([21, 13], 'east')
  .door([22, 13], 'east')
  .door([26, 15], 'south', { stuck: true })
  // North: the night stair, the broken stair, the scriptorium, and the well.
  .open([8, 7], 'south')
  .door([5, 3], 'east')
  .door([8, 3], 'east')
  .door([3, 6], 'east')
  .door([12, 5], 'south')
  .open([12, 7], 'south')
  .open([18, 5], 'south')
  .open([18, 7], 'south')
  .door([19, 4], 'east', { stuck: true })
  // The Drain Folk: the crawl from the well, and the tunnel from the cloister walk.
  .open([23, 2], 'east')
  .open([21, 9], 'east')
  .door([25, 7], 'north')
  .feature({
    id: 'votive_niche',
    kind: 'custom',
    cell: [8, 12],
    description:
      'A niche in the wall of the cloister walk holds a hundred stubs of votive candles, melted into one grey lump.',
  })
  .transition({
    kind: 'stairs_down',
    position: [3, 3],
    to_dungeon_id: DUNGEON,
    to_level_number: 2,
    to_position: [3, 3],
    to_facing: 'east',
  })
  .transition({
    kind: 'trapdoor',
    position: [2, 11],
    to_dungeon_id: DUNGEON,
    to_level_number: 2,
    to_position: [2, 11],
    to_facing: 'east',
  })
  .transition({
    kind: 'stairs_down',
    position: [27, 22],
    to_dungeon_id: DUNGEON,
    to_level_number: 2,
    to_position: [27, 22],
    to_facing: 'west',
  });

// ---------------------------------------------------------------------------------------------
// Level 2 key.

level2
  .area('N', {
    id: 'stair_foot',
    name: 'Foot of the night stair',
    description:
      'The night stair ends on a small vaulted landing. On the wall, a painted procession of monks carries lanterns down into the dark. A door leads east, and a passage runs south.',
  })
  .area('E', {
    id: 'brothers_crypt',
    name: "Brothers' crypt",
    description:
      'A long gallery lined from floor to vault with burial niches, three high. Many niches have been broken open from the inside and stand empty. Something rattles in the dark at the far end.',
    encounter: monsters([['skeleton', 3]], { stance: 'attacks' }),
  })
  .area('V', {
    id: 'founders_tomb',
    name: "Founders' tomb",
    description:
      "Three stone coffins stand on a dais under a ceiling painted with stars. Two of the lids have been pushed aside from within. The third coffin, carved with an abbot's crook, is still sealed.",
    encounter: monsters([['zombie', 2]], { stance: 'attacks' }),
    features: [
      {
        id: 'abbots_coffin',
        kind: 'treasure_cache',
        description:
          'Inside the sealed coffin, a skeleton in rotted vestments wears a heavy gold ring and has a purse of old coins under its folded hands.',
        coins: { gp: 60 },
        valuables: [valuable('jewellery', "Abbot's gold ring", 150)],
      },
    ],
  })
  .area('F', {
    id: 'priors_study',
    name: "Prior's study",
    description:
      'A dry, close room, as if the flood never reached it. Ledgers fill the shelves, a brazier stands full of cold ash, and on the writing desk lies an unfinished letter in a cramped hand.',
    features: [
      {
        id: 'priors_desk',
        kind: 'treasure_cache',
        description:
          "The desk drawers hold the prior's household money and a stoppered bottle of healing draught.",
        coins: { gp: 80 },
        magic_item_ids: ['potion_of_healing'],
      },
      {
        id: 'unsent_letter',
        kind: 'custom',
        description:
          "The letter is addressed to the bishop. 'The water rises every day. I have hung Mercy in the low tower, where no thief can reach her, and the Hand lies in the vault beneath this room. I will not leave them.' It is signed Hadric Vole, Prior.",
      },
    ],
  })
  .area('U', {
    id: 'relic_vault',
    name: 'Relic vault',
    description:
      'A small vault walled in blue tile. On a marble shelf sits a casket of silver and crystal, and inside it is a withered hand wrapped in gold wire. A heavy chest stands below the shelf.',
    trap: trap({ kind: 'room', trigger: 'open', damage_dice: '1d8', save: save('wands') }),
    features: [
      {
        id: 'reliquary_casket',
        kind: 'treasure_cache',
        description:
          'The casket holds the Hand of Saint Corvane. A thin pipe runs from its base into the shelf.',
        item_ids: ['hand_of_saint_corvane'],
        trap: trap({ kind: 'treasure', trigger: 'open', damage_dice: '1d6', save: save('breath', 'half') }),
      },
      {
        id: 'offering_chest',
        kind: 'treasure_cache',
        description: "Pilgrims' offerings in gold, and a scroll sealed with the priory's lantern seal.",
        coins: { gp: 200 },
        magic_item_ids: ['scroll_of_protection_from_undead'],
      },
    ],
  })
  .area('T', {
    id: 'sunken_flags',
    name: 'Sunken flagstones',
    description:
      'The processional way dips here, and the flagstones sag toward the middle, as if the ground beneath them has washed away.',
    trap: trap({ kind: 'room', trigger: 'enter', damage_dice: '1d4', fall_feet: 10 }),
  })
  .area('X', {
    id: 'midden',
    name: 'Midden',
    description:
      'A reeking pit under the refectory, where the brothers threw their kitchen waste. A square of grey light shows high overhead. Long-bodied things move through the refuse.',
    encounter: monsters([['centipede_giant', 2]]),
  })
  .area('Q', {
    id: 'cistern',
    name: 'Cistern',
    description:
      'A vaulted cistern flooded knee-deep with black water. The floor is slimy underfoot, and a broken chute high in the north wall drips into the pool. Big pale shapes float at the surface, watching you.',
    encounter: monsters([['toad_giant', '1d3']]),
    features: [
      {
        id: 'drowned_purse',
        kind: 'treasure_cache',
        description: 'A purse lies on the bottom of the cistern, its strings still knotted.',
        coins: { sp: 200 },
      },
    ],
  })
  .area('W', {
    id: 'sluice_room',
    name: 'Sluice room',
    description:
      'A great wooden winch fills this room. Its chains run down through a slot in the floor, and you can hear water moving below. The iron pawl that holds the winch is rusted almost through.',
  })
  .area('M', {
    id: 'fungus_gallery',
    name: 'Fungus gallery',
    description:
      'Pale mushrooms as tall as a man crowd this damp passage. Their caps are beaded with water, and the air tastes of earth.',
    encounter: monsters([['shrieker', 2]]),
  })
  .area('Y', {
    id: 'flooded_stair',
    name: 'Flooded stair',
    description:
      'A square landing at the head of a stair that goes down into black water. The water stands level with the top step and never ripples. Tide marks on the walls show where it once stood higher, and lower.',
  })
  .area('G', {
    id: 'gnawed_niche',
    name: 'Gnawed niche',
    description:
      'A low burial chamber that stinks of rot. Bones lie cracked open and sucked clean. Coins glint among them.',
    encounter: monsters([['ghoul', 1]]),
    features: [
      {
        id: 'gnawed_bones',
        kind: 'treasure_cache',
        description: "Among the bones: scattered gold, a sapphire, and a dagger whose blade hasn't rusted.",
        coins: { gp: 150 },
        magic_item_ids: ['dagger_plus_1'],
        valuables: [valuable('gem', 'Sapphire', 100)],
      },
    ],
  })
  .area('O', {
    id: 'lower_ossuary',
    name: 'Lower ossuary',
    description:
      'Bones are packed into the walls here like stones in a dry-stone wall: long bones and skulls set in patterns of crosses and wheels. A stair climbs into the dark in the east.',
    treasure: { letters: ['Q', 'S'], unguarded: false },
    features: [
      {
        id: 'bone_wheel',
        kind: 'custom',
        description:
          'One wheel of skulls is newer than the rest. The skulls are small, and each one has a single coin pressed into its mouth.',
      },
    ],
  })
  .area('K', {
    id: 'tilted_crypt',
    name: 'Tilted crypt',
    description:
      'A crypt of plain coffins, all slid against the west wall in a jumble. A wide crack runs up the west wall, and cold, wet air breathes out of it.',
    features: [
      {
        id: 'sloping_floor',
        kind: 'construction_trick',
        description:
          'The whole floor tilts down toward the west, so gently that only a careful eye notices. Everything loose has crept toward the crack, and the crack goes down a long way.',
      },
    ],
  });

level2
  .door([4, 3], 'east')
  .open([5, 3], 'east')
  .open([3, 4], 'south')
  .door([3, 8], 'south')
  .door([4, 12], 'east', { stuck: true })
  .door([11, 4], 'south')
  .open([11, 11], 'south')
  .open([17, 3], 'east')
  .door([19, 3], 'east', { stuck: true })
  .door([22, 5], 'south', { stuck: true })
  .open([22, 11], 'south')
  .open([24, 3], 'east')
  .door([25, 3], 'east', {
    requires: gate(hasItem('priors_iron_key'), {
      refusal:
        'A heavy oak door, banded with iron, with a keyhole shaped like a bell. It has no handle, and it will not move.',
      success: 'The iron key turns with a grinding click, and the door swings open on dry air.',
    }),
  })
  .door([27, 4], 'south', { kind: 'secret' })
  .door([27, 8], 'south')
  .open([27, 11], 'south')
  .join('T', '.')
  .open([5, 13], 'south')
  .door([5, 15], 'south', { stuck: true })
  .door([6, 17], 'east', { locked: true })
  .open([7, 17], 'east')
  .open([12, 17], 'east')
  .open([13, 17], 'east')
  .open([15, 13], 'south')
  .open([15, 14], 'south')
  .open([19, 13], 'south')
  .open([19, 14], 'south')
  .door([19, 18], 'south')
  .open([19, 19], 'south')
  .door([22, 21], 'east')
  .open([23, 21], 'east')
  .open([25, 13], 'south')
  .door([25, 15], 'east', { stuck: true })
  .door([25, 17], 'south')
  .feature({
    id: 'goblin_pouch',
    kind: 'treasure_cache',
    cell: [22, 8],
    description: 'A dead goblin lies curled in the passage with a pouch still tied at its belt.',
    coins: { sp: 30 },
  })
  .transition({
    kind: 'stairs_up',
    position: [3, 3],
    to_dungeon_id: DUNGEON,
    to_level_number: 1,
    to_position: [3, 3],
    to_facing: 'east',
  })
  .transition({
    kind: 'stairs_up',
    position: [27, 22],
    to_dungeon_id: DUNGEON,
    to_level_number: 1,
    to_position: [27, 22],
    to_facing: 'west',
  })
  .transition({
    kind: 'stairs_down',
    position: [19, 16],
    to_dungeon_id: DUNGEON,
    to_level_number: 3,
    to_position: [19, 16],
    to_facing: 'south',
    requires: gate(flagEquals('priory.sluice', 'open'), {
      refusal:
        'Black water fills the stairwell to the top step, cold and still. The tide marks say it has been drained before.',
      success: 'The stair runs down wet and stinking where the water stood, and weed hangs from the walls.',
    }),
  })
  .transition({
    kind: 'passage',
    position: [18, 22],
    side: 'west',
    to_dungeon_id: DUNGEON,
    to_level_number: 3,
    to_position: [24, 20],
    to_facing: 'west',
  });

// ---------------------------------------------------------------------------------------------
// Level 3 key.

level3
  .area('S', {
    id: 'belfry_stair',
    name: 'Foot of the flooded stair',
    description:
      'The stair ends in a chamber still ankle-deep in water. Weed and drowned rushes cling to every surface. You can hear the bell clearly now, slow and patient, somewhere to the south.',
  })
  .area('N', {
    id: 'drowned_nave',
    name: 'Drowned nave',
    description:
      'The lower church of the priory, sunk when the tower fell. Water stands knee-deep between thick pillars. Pews float upside down, and robed figures stand among them in the water, motionless, facing the altar.',
    encounter: monsters([['zombie', 3]], { stance: 'attacks' }),
  })
  .area('C', {
    id: 'sacristy',
    name: 'Sacristy',
    description:
      'The vestry where the priests robed for the lower church. A tall chest of carved oak stands against the wall, its doors swollen shut. Moths have eaten the vestments that hang beside it.',
    features: [
      {
        id: 'vestment_chest',
        kind: 'treasure_cache',
        description:
          'Inside the chest, under folded altar linen: a silver chalice, a bag of gold, and a flanged mace wrapped in oilcloth.',
        coins: { gp: 100 },
        magic_item_ids: ['mace_plus_1'],
        valuables: [valuable('jewellery', 'Silver chalice', 250, 10)],
        trap: trap({
          kind: 'treasure',
          trigger: 'open',
          affects: 'party',
          save: save('death'),
          condition: 'asleep',
          condition_duration_dice: '1d4',
          condition_duration_unit: 'turn',
        }),
      },
    ],
  })
  .area('R', {
    id: 'last_refuge',
    name: 'Last refuge',
    description:
      'A sealed room where some of the brothers hid from the flood. They are here still, seated in a row along the wall with their hands folded. Above them someone has scratched eleven names into the plaster, and a prayer.',
    features: [
      {
        id: 'brothers_strongbox',
        kind: 'treasure_cache',
        description:
          'A small strongbox under the bench, holding the gems the brothers saved from the treasury.',
        coins: { pp: 20 },
        valuables: [
          valuable('gem', 'Garnet', 100),
          valuable('gem', 'Garnet', 100),
          valuable('gem', 'Topaz', 250),
        ],
      },
    ],
  })
  .area('G', {
    id: 'fallen_gallery',
    name: 'Fallen gallery',
    description:
      'Part of the bell tower lies along this gallery where it fell, a ramp of masonry and broken beams. The east wall is a heap of rubble, and through the gaps in it you can see up into the crypts.',
    features: [
      {
        id: 'key_stone',
        kind: 'construction_trick',
        description:
          'The ramp of fallen masonry rests on one wedged block. Pull that block out and the whole ramp comes down, sealing the gap to the crypts.',
      },
    ],
  })
  .area('H', {
    id: 'choir',
    name: 'Choir',
    description:
      'Rows of carved choir stalls lean over a floor of rotten planks, and water slaps against the boards from beneath. Great double doors in the south wall are carved with a bell and the word MERCY.',
    trap: trap({
      kind: 'room',
      trigger: 'enter',
      manual:
        'The planks give way under the first character in the marching order, who drops chest-deep into the water below. That character loses any torch or lantern they carry, and the party takes one round to haul them out.',
    }),
  })
  .area('B', {
    id: 'bell_pit',
    name: 'The bell pit',
    description:
      'The tower fell here and drove its bell through the floor of the church. Mercy lies on her side in a pool of black water: a bronze bell as tall as two men, green with age, her tongue still hanging inside her. Robed shapes stand around her in the water, and one of them wears the silver chain of a prior.',
    encounter: monsters(
      [
        ['drowned_prior', 1],
        ['zombie', 2],
      ],
      { aware: true, stance: 'attacks' },
    ),
    features: [
      {
        id: 'inside_the_bell',
        kind: 'treasure_cache',
        description:
          "The tongue of the bell, an iron clapper as long as a man's arm, hangs from a rusted staple. It comes free with a hard pull.",
        item_ids: ['tongue_of_mercy'],
      },
      {
        id: 'priors_hoard',
        kind: 'treasure_cache',
        description:
          "The prior's treasure, sunk in the pool at his feet: coins in rotten bags, a shield with a lantern boss, and his silver chain of office.",
        coins: { gp: 600, sp: 1000 },
        magic_item_ids: ['shield_plus_1'],
        valuables: [valuable('jewellery', "Prior's chain of office", 400, 20)],
      },
      {
        id: 'mercy',
        kind: 'custom',
        description: 'Letters run around the lip of the bell: I CALL THE FAITHFUL HOME.',
      },
    ],
  });

level3
  .open([7, 9], 'east')
  .door([6, 9], 'east', { stuck: true })
  .door([4, 10], 'south', { kind: 'secret' })
  .door([4, 14], 'south')
  .open([16, 12], 'east')
  .open([19, 14], 'south')
  .open([13, 12], 'south')
  .open([13, 13], 'south')
  .open([16, 15], 'east')
  .open([17, 15], 'east')
  .door([13, 16], 'south')
  .open([13, 17], 'south')
  .door([19, 17], 'south', { stuck: true })
  .open([18, 21], 'east')
  .open([20, 21], 'east')
  .transition({
    kind: 'stairs_up',
    position: [19, 16],
    to_dungeon_id: DUNGEON,
    to_level_number: 2,
    to_position: [19, 16],
    to_facing: 'north',
  })
  .transition({
    kind: 'passage',
    position: [24, 20],
    side: 'east',
    to_dungeon_id: DUNGEON,
    to_level_number: 2,
    to_position: [18, 22],
    to_facing: 'east',
  });

// ---------------------------------------------------------------------------------------------
// Wandering monsters.

const undercroftTable = wanderingTable('priory_undercroft', 'Priory undercroft', 1, [
  [1, 3, 'Giant rats', 'giant_rat', '1d6'],
  [4, 6, 'Red Thumb goblins', 'goblin', '1d4'],
  [7, 8, 'Drain Folk kobolds', 'kobold', '1d6'],
  [9, 10, 'Fire beetles', 'fire_beetle', '1d2'],
  [11, 12, 'Stirges', 'stirge', '1d4'],
  [13, 14, 'Skeletons', 'skeleton', '1d3'],
  [15, 17, 'Giant centipedes', 'centipede_giant', '1d3'],
  [18, 18, 'Rival adventurers', 'npc:basic', 3],
  [19, 20, 'Wreck robbers', 'bandit', '1d4'],
]);

const cryptTable = wanderingTable('priory_crypts', 'Priory crypts', 2, [
  [1, 4, 'Skeletons', 'skeleton', '1d4'],
  [5, 7, 'Zombies', 'zombie', '1d2'],
  [8, 9, 'Giant centipedes', 'centipede_giant', '1d4'],
  [10, 11, 'Crab spider', 'crab_spider', 1],
  [12, 13, 'Giant rats', 'giant_rat', '2d4'],
  [14, 15, 'Red Thumb goblins', 'goblin', '1d4'],
  [16, 17, 'Fire beetles', 'fire_beetle', '1d3'],
  [18, 18, 'Ghoul', 'ghoul', 1],
  [19, 19, 'Rival adventurers', 'npc:basic', 3],
  [20, 20, 'Giant toad', 'toad_giant', 1],
]);

const belfryTable = wanderingTable('priory_belfry', 'Drowned belfry', 3, [
  [1, 6, 'Drowned brothers', 'zombie', '1d3'],
  [7, 10, 'Skeletons', 'skeleton', '1d4'],
  [11, 13, 'Giant toads', 'toad_giant', '1d2'],
  [14, 15, 'Crab spiders', 'crab_spider', '1d2'],
  [16, 17, 'Ghoul', 'ghoul', 1],
  [18, 20, 'Fire beetles', 'fire_beetle', '1d3'],
]);

// ---------------------------------------------------------------------------------------------
// The adventure.

const drownedPrior = {
  id: 'drowned_prior',
  name: 'Drowned Prior',
  display_name: 'robed corpse',
  display_name_plural: 'robed corpses',
  family_id: 'zombie',
  page: '',
  intro:
    'Prior Hadric Vole, who drowned with his treasure rather than leave it, and who rings the sunken bell to call his brothers back.',
  ac: 7,
  ac_ascending: 12,
  ac_alternates: [],
  attack_roll_required: true,
  hit_dice: { count: 3, die: 8, modifier: 0, asterisks: 0, average_hp: 13, fixed_hp: null },
  attacks: [
    {
      attacks: [
        {
          count: 1,
          name: 'drowning grip',
          damage: '1d8',
          fixed_damage: null,
          fixed_damage_options: [],
          by_weapon: false,
          by_weapon_modifier: 0,
          effects: [],
        },
      ],
      use: 'primary',
    },
  ],
  thac0: 17,
  attack_bonus: 2,
  movement: [{ rate_feet: 60, encounter_rate_feet: 20, descriptor: null }],
  saves: { values: { death: 12, wands: 13, paralysis: 14, breath: 15, spells: 16 }, save_as: '3' },
  morale: 12,
  morale_alternates: [],
  alignment: { options: ['chaotic'], usual: null },
  xp: 35,
  xp_notes: [],
  number_appearing: {
    dungeon: { dice: null, fixed: 1, see_below: false },
    lair: { dice: null, fixed: 1, see_below: false },
  },
  treasure: { letters: [], parenthetical: [], extra_gp: 0, multiplier: 1, special: [], see_below: false },
  abilities: [
    {
      tag: 'undead',
      name: 'Undead',
      prose:
        'Makes no noise until it attacks. Immune to effects that affect living creatures, and to mind-affecting spells such as charm, hold, and sleep.',
      manual: true,
      params: {},
    },
  ],
  defenses: {
    harmed_only_by: [],
    reductions: [],
    energy: {},
    condition_immunities: ['poisoned', 'charmed', 'asleep'],
  },
  categories: ['undead'],
  overrides_applied: [],
};

const gear = (id, name) => ({
  item_type: 'gear',
  id,
  name,
  cost_gp: 0,
  lot_size: 1,
  capacity_coins: null,
  combat: null,
  params: {},
  overrides_applied: [],
});

const areaEntered = (level_number, area_id) => ({
  pattern_type: 'area_entered',
  dungeon_id: DUNGEON,
  level_number,
  area_id,
});
const clause = (pattern, conditions = []) => ({ pattern, conditions });
const objective = (id, name, when, extra = {}) => ({
  id,
  name,
  when,
  hidden: false,
  reveal_when: null,
  narrative: narrative(extra.narrative),
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'narrative')),
});
const triggerSpec = (id, when, consequences, beats, extra = {}) => ({
  id,
  when,
  conditions: [],
  repeatable: false,
  consequences,
  narrative: narrative(beats),
  ...extra,
});

const payload = {
  name: 'The Drowned Bell',
  description:
    "On still nights, the people of Hollin Ferry hear a bell tolling under the Grey Mere, from the sunken priory on Corvane's Holm. Since it began, the drowned dead have been seen walking on the causeway. An introductory adventure for three to six characters of first level.",
  hooks: [
    "Mother Aldis of the temple of the Lantern asks you to bring back the drowned bell's tongue, so the temple can melt it down and end the tolling.",
    'Reeve Tamsin Hale pays 100 gp for the death of Gashnak One-Ear, the hobgoblin whose goblins rob the ferry.',
    'The brothers of the priory kept a famous relic, the Hand of Saint Corvane. Nobody found it after the flood.',
  ],
  party: { min_level: 1, max_level: 1, min_size: 3, max_size: 6 },
  town: {
    name: 'Hollin Ferry',
    description:
      "A huddle of reed-thatched houses and smokehouses on the shore of the Grey Mere. A flat-bottomed ferry crosses to Corvane's Holm when the ferryman can be paid to go. The temple of the Lantern stands at the top of the street, and its own bell has hung silent since the drowned bell began to toll.",
    services: [
      "Ostler's store: weapons, armour, and adventuring gear",
      'Temple of the Lantern: cure light wounds, cure serious wounds, cure disease, neutralize poison, remove curse, and raise dead',
      'Widow Marl, moneychanger: buys gems, jewellery, and coin',
      'The Smoked Eel: beds, hot food, and a quiet corner to study spells',
    ],
    travel_turns: { [DUNGEON]: 3 },
    healing_prices: { cure_light_wounds: 20, raise_dead: 1000 },
  },
  dungeons: [
    {
      id: DUNGEON,
      name: "The priory on Corvane's Holm",
      levels: [
        level1.build({
          entrance: [14, 23],
          wandering: { chance_in_six: 1, interval_turns: 2, table: undercroftTable },
          guidance:
            "The undercroft belongs to two small factions. The Red Thumb goblins are bullies who rob the ferry. They break and flee once Gashnak falls. The Drain Folk kobolds are hungry and afraid of the goblins, and they trade what they know for food or for the goblins' defeat: the Hand lies in a vault below the prior's study, the prior's key is in Gashnak's chest, and the flooded stair can be drained from the sluice. Every few turns, mention the bell, a single muffled note from below, felt through the floor more than heard.",
        }),
        level2.build({
          wandering: { chance_in_six: 1, interval_turns: 2, table: cryptTable },
          guidance:
            'The crypts are quiet, cold, and dry except in the south, where water seeps in. The dead here were brothers of the priory, and they rise because the bell calls them. They are mindless and never talk. The bell is louder here, and the players should begin to feel that it is calling to someone. The sluice drains the flooded stair to the belfry, and nothing else does.',
        }),
        level3.build({
          wandering: { chance_in_six: 2, interval_turns: 2, table: belfryTable },
          guidance:
            'Everything here is wet, dark, and slow. Water hides the floor, so describe every step as uncertain. The bell tolls once each turn. The prior is no thinking villain: he is a drowned miser who cannot let go of his bell and his gold. When he falls, the bell stops, and the silence afterward should feel enormous.',
        }),
      ],
    },
  ],
  monsters: [
    drownedPrior,
    named('hobgoblin', {
      id: 'gashnak',
      name: 'Gashnak One-Ear',
      display_name: 'Gashnak One-Ear',
      display_name_plural: 'Gashnak One-Ears',
      family_id: 'hobgoblin',
      intro: 'The hobgoblin with a ragged left ear who leads the Red Thumb goblins.',
    }),
  ],
  items: [
    gear('priors_iron_key', "Prior's iron key"),
    gear('hand_of_saint_corvane', 'Hand of Saint Corvane'),
    gear('tongue_of_mercy', 'Tongue of the bell Mercy'),
  ],
  spells: [],
  triggers: [
    triggerSpec('landing', { pattern_type: 'dungeon_entered', dungeon_id: DUNGEON }, [], {
      fired:
        'The party has landed on the Holm. Describe the bell: one note, felt through the soles of the feet.',
      journal:
        "The ferry grounds at the landing stage of Corvane's Holm. As you step ashore, a bell tolls once, somewhere beneath your feet.",
    }),
    triggerSpec('drain_folk_talk', { pattern_type: 'area_entered', ...areaEntered(1, 'drain_warren') }, [], {
      fired: 'The kobolds will talk if the party lets them. See the level guidance for what they know.',
      journal:
        "The kobolds jabber in broken Common: Red Thumbs steal their eels. The big-bell man lives under the water. The brothers' shining hand sleeps under the old prior's room, and his key is in the goblin chief's box.",
    }),
    triggerSpec(
      'gashnak_falls',
      { pattern_type: 'monster_defeated', template_id: 'gashnak' },
      [{ command_type: 'set_flag', source: null, key: 'priory.gashnak', value: 'dead' }],
      {
        fired:
          'Gashnak is dead. The surviving goblins check morale at a penalty and flee the Holm if they fail.',
        journal:
          'Gashnak One-Ear is dead. Without him, the Red Thumbs will not hold the undercroft for long.',
      },
    ),
    triggerSpec('bell_louder', { pattern_type: 'level_entered', dungeon_id: DUNGEON, level_number: 2 }, [], {
      journal: 'In the crypts the tolling is louder, slow and regular, like a summons.',
    }),
    triggerSpec(
      'sluice_runs',
      { pattern_type: 'area_entered', ...areaEntered(2, 'sluice_room') },
      [
        { command_type: 'set_flag', source: null, key: 'priory.sluice', value: 'open' },
        {
          command_type: 'set_door_state',
          source: null,
          dungeon_id: DUNGEON,
          level_number: 2,
          x: 6,
          y: 17,
          direction: 'east',
          open: true,
          wedged: null,
          discovered: null,
          unlocked: true,
        },
      ],
      {
        fired:
          'The sluice has run. The flooded stair is now open, and so is the gate between the sluice room and the cistern.',
        journal:
          'The rotten pawl snaps under your weight. The winch spins, the chains roar down through the floor, and somewhere to the east a great mass of water drains away with a long, sucking groan. The sluice gate in the east wall swings open.',
      },
    ),
    triggerSpec(
      'hand_taken',
      { pattern_type: 'item_acquired', item_id: 'hand_of_saint_corvane' },
      [
        {
          command_type: 'spawn_monsters',
          source: null,
          template_id: 'skeleton',
          count_dice: null,
          count_fixed: 3,
          distance_feet: 20,
        },
      ],
      {
        fired: 'Three skeletons, the last guardians of the relic, climb out of the walls of the vault.',
        journal: 'As the Hand leaves its casket, the blue tiles crack, and bony arms reach out of the walls.',
      },
    ),
    triggerSpec(
      'choir_toll',
      { pattern_type: 'area_entered', ...areaEntered(3, 'choir') },
      [],
      {
        fired:
          'Each time the party crosses the choir, the bell beyond the south doors tolls once, close and loud.',
      },
      { repeatable: true },
    ),
    triggerSpec(
      'prior_falls',
      { pattern_type: 'monster_defeated', template_id: 'drowned_prior' },
      [{ command_type: 'set_flag', source: null, key: 'priory.prior', value: 'laid_to_rest' }],
      {
        fired:
          'The prior is destroyed, and the bell falls silent for good. Any undead left on the Holm stop where they stand and crumble.',
        journal:
          'The drowned prior sinks into the black water, and for the first time since you landed, the bell is silent.',
      },
    ),
  ],
  // The quest that ends the adventure comes last, so that when one return to town completes
  // several quests, the others pay out before the session ends in victory.
  quests: [
    {
      id: 'red_thumbs',
      name: 'Break the Red Thumbs',
      activation: null,
      objectives: [
        objective(
          'kill_gashnak',
          'Kill Gashnak One-Ear',
          clause({ pattern_type: 'monster_defeated', template_id: 'gashnak' }),
          {
            narrative: { progress: 'Gashnak One-Ear will rob no more ferries.' },
          },
        ),
        objective(
          'report_to_reeve',
          'Report to Reeve Tamsin Hale',
          clause({ pattern_type: 'town_entered' }, [flagEquals('priory.gashnak', 'dead')]),
          {
            narrative: {
              progress: "The reeve hears your story and sends a boy running for the ferry's strongbox.",
            },
          },
        ),
      ],
      rewards: [
        { command_type: 'grant_coins', source: null, character_id: '@first', coins: coins({ gp: 100 }) },
        { command_type: 'award_xp', source: null, character_id: '@party', amount: 100 },
      ],
      completion: 'all',
      concludes_adventure: false,
      narrative: narrative({
        offer:
          'Reeve Tamsin Hale has posted a bounty on the ferry house door: 100 gp for the death of Gashnak One-Ear, the hobgoblin whose goblins rob the ferry and the eel traps.',
        completion:
          'The reeve counts out the bounty and shakes each of your hands. The ferry will run again.',
        speaker: 'Reeve Tamsin Hale',
      }),
    },
    {
      id: 'saints_hand',
      name: 'The Hand of Saint Corvane',
      activation: clause({ pattern_type: 'dungeon_entered', dungeon_id: DUNGEON }),
      objectives: [
        objective(
          'learn_where',
          'Learn where the brothers hid the Hand',
          clause(areaEntered(2, 'relic_vault')),
          {
            hidden: true,
            reveal_when: clause(areaEntered(1, 'drain_warren')),
            narrative: {
              offer: "The kobolds say the shining hand sleeps beneath the old prior's room.",
              progress: 'You have found the relic vault of the priory.',
            },
          },
        ),
        objective(
          'find_hand',
          'Recover the Hand',
          clause({ pattern_type: 'item_acquired', item_id: 'hand_of_saint_corvane' }),
          {
            narrative: { progress: 'The Hand of Saint Corvane is yours to carry home.' },
          },
        ),
        objective(
          'return_hand',
          'Return the Hand to the temple',
          clause({ pattern_type: 'town_entered' }, [hasItem('hand_of_saint_corvane')]),
          { narrative: { progress: 'The temple bell-ringer weeps when she sees what you have brought.' } },
        ),
      ],
      rewards: [
        {
          command_type: 'remove_item',
          source: null,
          character_id: '@carrier',
          item_id: 'hand_of_saint_corvane',
          quantity: 1,
        },
        { command_type: 'grant_coins', source: null, character_id: '@first', coins: coins({ gp: 150 }) },
        { command_type: 'award_xp', source: null, character_id: '@party', amount: 200 },
      ],
      completion: 'all',
      concludes_adventure: false,
      narrative: narrative({
        offer:
          "As the ferry grounds, the ferryman tells you about the priory's relic, the Hand of Saint Corvane, lost in the flood. The temple would pay well to have it back.",
        completion:
          'The Hand of Saint Corvane goes back into the temple of the Lantern, and Mother Aldis pays you from the alms box.',
        speaker: 'the ferryman',
      }),
    },
    {
      id: 'silence_the_bell',
      name: 'Silence the drowned bell',
      activation: null,
      objectives: [
        objective(
          'find_belfry',
          'Find the drowned belfry',
          clause({ pattern_type: 'level_entered', dungeon_id: DUNGEON, level_number: 3 }),
          {
            narrative: {
              progress: 'You have found the drowned church beneath the priory. The bell is close.',
            },
          },
        ),
        objective(
          'lay_the_prior',
          'Lay the drowned prior to rest',
          clause({ pattern_type: 'monster_defeated', template_id: 'drowned_prior' }),
          {
            hidden: true,
            reveal_when: clause(areaEntered(2, 'priors_study')),
            narrative: {
              offer:
                "The prior's unsent letter names the one who rings the bell: Hadric Vole himself, who would not leave his treasure even for the flood.",
              progress: 'Prior Hadric Vole lies still at last.',
            },
          },
        ),
        objective(
          'take_tongue',
          'Take the tongue of Mercy',
          clause({ pattern_type: 'item_acquired', item_id: 'tongue_of_mercy' }),
          {
            narrative: { progress: 'The iron tongue of the bell is yours, heavy and cold.' },
          },
        ),
        objective(
          'bring_tongue',
          'Bring the tongue to Hollin Ferry',
          clause({ pattern_type: 'town_entered' }, [hasItem('tongue_of_mercy')]),
          {
            narrative: {
              progress: 'You carry the tongue of Mercy up the street to the temple of the Lantern.',
            },
          },
        ),
      ],
      rewards: [
        {
          command_type: 'remove_item',
          source: null,
          character_id: '@carrier',
          item_id: 'tongue_of_mercy',
          quantity: 1,
        },
        { command_type: 'grant_coins', source: null, character_id: '@party', coins: coins({ gp: 50 }) },
        { command_type: 'award_xp', source: null, character_id: '@party', amount: 400 },
        { command_type: 'set_flag', source: null, key: 'quest.bell', value: 'silenced' },
      ],
      completion: 'all',
      concludes_adventure: true,
      narrative: narrative({
        offer:
          "Mother Aldis asks you to cross to the priory on Corvane's Holm, find the bell that tolls under the water, and bring back its tongue so the temple can melt it down.",
        completion:
          "Mother Aldis lays the iron tongue on the temple anvil and says a long prayer over it. That night the Grey Mere is silent, and the temple's own bell rings for the first time in a month.",
        speaker: 'Mother Aldis',
      }),
    },
  ],
};

export const file = 'the-drowned-bell.json';
export const document = envelope(payload);
