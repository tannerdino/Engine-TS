import prompts from 'prompts';
import fs from 'fs';
import { packClient, packServer } from '#/cache/PackAll.js';
import Environment from '#/util/Environment.js';
import { printError, printInfo } from '#/util/Logger.js';
import { updateCompiler } from '#/util/RuneScriptCompiler.js';
import type Npc from './engine/entity/Npc.js';


if (Environment.BUILD_STARTUP_UPDATE) {
    await updateCompiler();
}

if (!fs.existsSync('data/pack/client/config') || !fs.existsSync('data/pack/server/script.dat')) {
    printInfo('Packing cache, please wait until you see the world is ready.');

    try {
        await packServer();
        await packClient();
    } catch (err) {
        if (err instanceof Error) {
            printError(err.message);
        }
        process.exit(1);
    }
}

const response = await prompts({
    type: 'select',
    name: 'simType',
    message: 'Which simulation would you like to run?',
    choices: [
        { title: 'Barb fishing', value: 'barbSim' },
        { title: 'Lumby fishing', value: 'lumbSim' },
        { title: 'Wildy Agility', value: 'agileSim' },
        { title: 'Mining', value: 'miningSim'},
        { title: 'Exit', value: 'exit' }
    ]
});

switch (response.simType) {
    case 'barbSim': {
        await simFishing();
        break;
    }
    case 'lumbSim': {
        await simFishing();
        break;
    }
    case 'agileSim': {
        await simAgility();
        break;
    }
    case 'miningSim': {
        await simDog();
        break;
    }
    case 'exit':
    default:
        console.log('Exiting.');
        process.exit(0);
}


async function simAgility() {
    const { promptStatLevel, promptStatXpGoal } = await import('./sim/SimPrompts.js');
    const { MoveSpeed } = await import('./engine/entity/MoveSpeed.js');
    const { PlayerStat, PlayerStatNameMap } = await import('./engine/entity/PlayerStat.js');
    const { getLevelByExp } = await import('./engine/entity/Player.js');
    const World = (await import('./engine/World.js')).default;
    const Loc = (await import('./engine/entity/Loc.js')).default;

    const defence = await promptStatLevel(PlayerStat.DEFENCE);
    const hitpoints = await promptStatLevel(PlayerStat.HITPOINTS);

    const {start, end} = await promptStatXpGoal(PlayerStat.AGILITY);
    const agility = getLevelByExp(start*10);
    await World.startSim([{x1:2993, z1: 3931, x2: 3007, z2: 3966}, {x1: 2991, z1: 10340, x2: 3007, z2:10365}]);
    
    const mx = 46*64;
    const mz = 61*64;
    const obstacle_pipe = World.getLoc(mx+60, mz+34, 0, 2288);
    const obstacle_rope = World.getLoc(mx+61, mz+48, 0, 2283);
    const obstacle_step = World.getLoc(mx+57, mz+56, 0, 2311);
    const obstacle_log = World.getLoc(mx+57, mz+41, 0, 2297);
    const obstacle_rocks = World.getLoc(mx+50, mz+32, 0, 2328);
    const ladder = World.getLoc(mx+61, mz+59+6400, 0, 1755);
    if (!ladder || !obstacle_pipe || !obstacle_rope || !obstacle_log || !obstacle_rocks || !obstacle_step) {
        console.log(ladder instanceof Loc, obstacle_pipe instanceof Loc, obstacle_rope instanceof Loc, obstacle_log instanceof Loc, obstacle_rocks instanceof Loc, obstacle_step instanceof Loc);
        console.log('Problem loading locs.');
        return;
    }

    const player = World.addSimPlayer('Tanner', 3004, 3937);
    player.setLevel(PlayerStat.DEFENCE, defence);
    player.setLevel(PlayerStat.HITPOINTS, hitpoints);
    player.setLevel(PlayerStat.AGILITY, agility);
    player.login = (player) => {
        player.give('ikov_bootsoflightness', 1);
        player.equipAll();
        // player.give('cake', 28);
    };
    player.clientInput = (player) => {
        if (player.delayed) {
            return;
        }
        if (player.moveSpeed === MoveSpeed.WALK && player.runenergy >= 100) {
            player.activate_run();
            // console.log(World.currentTick, 'Run activated.');
        }
        // if (player.stat(PlayerStat.HITPOINTS) < 5) {
        //     player.opHeldSlot(InvType.INV, 1, Math.floor((player.eats % 28)/3), false);
        //     player.eats++;
        //     if (player.eats % (28 * 3) === 0) {
        //         player.invClear(InvType.INV);
        //         player.give('cake', 28);
        //     }
        // }
        if (player.hasWaypoints() || player.target instanceof Loc) {
            return;
        }
        if (player.z > 6400) {
            player.opTarget(ladder, 1);
            return;
        }
        switch (player.wilderness_course_progress()) {
            case 0: 
                player.opMoveOrTarget(obstacle_pipe, 1, mx+60, mz+33);
                return;
            case 1:
                player.opMoveOrTarget(obstacle_rope, 1, mx+61, mz+49);
                return;
            case 2:
                player.opMoveOrTarget(obstacle_step, 1, mx+58, mz+56);
                return;
            case 3:
                player.opMoveOrTarget(obstacle_log, 1, mx+58, mz+41);
                return;
            case 4:
                player.opMoveOrTarget(obstacle_rocks, 1, mx+50, mz+33);
                return;
        }  
    };
    player.levelup = (player, stat) => {
        if (stat) {
            const statName = PlayerStatNameMap.get(stat); // 'ATTACK'
            console.log(`${World.currentTick}: Player advanced ${statName} to level ${player.stat(stat)}. Cakes eaten: ${player.eats/3}`);
        }
    };
    while (true) {
        World.cycle();
        if (player.xp(PlayerStat.AGILITY) >= end) {
            break;
        }
    }
    const xpgained = player.xp(PlayerStat.AGILITY) - start;
    console.log(`Ticks: ${World.currentTick}, Xp gained: ${xpgained}, Xp/hr avg: ${Math.floor(xpgained / (World.currentTick/6000))},Cakes eaten: ${player.eats/3}`);
    process.exit(0);
}

async function simFishing() {
    const { promptTicks } = await import('./sim/SimPrompts.js');
    const { MoveSpeed } = await import('./engine/entity/MoveSpeed.js');
    const { PlayerStat } = await import('./engine/entity/PlayerStat.js');
    const InvType = (await import('./cache/config/InvType.js')).default;
    const NpcType = (await import('./cache/config/NpcType.js')).default;
    const ObjType = (await import('./cache/config/ObjType.js')).default;
    const World = (await import('./engine/World.js')).default;

    const ticks = await promptTicks();
    // const barbArea = {x1: 3101, z1: 3422, x2: 3110, z2: 3434};
    // const lumbyArea = {x1: 3238, z1: 3240, x2: 3242, z2: 3253};
    await World.startSim([{x1: 3238, z1: 3240, x2: 3242, z2: 3253}]);
    const player = World.addSimPlayer('Tanner', 3239, 3252);
    player.setLevel(PlayerStat.FISHING, 99);
    player.invAdd(InvType.INV, ObjType.getId('fly_fishing_rod'), 1);
    player.invAdd(InvType.INV, ObjType.getId('feather'), 2000000000);

    console.log('Total npcs: ', World.getTotalNpcs());
    console.log('Total players: ', World.getTotalPlayers());

    const fishingSpots: Npc[] = [];
    for (const npc of World.npcs) {
        if (NpcType.get(npc.type).name == 'Fishing spot') {
            fishingSpots.push(npc);
        }
    }
    const fish1 = fishingSpots[0];
    const fish2 = fishingSpots[1];
    if (!fish1 || !fish2) {
        console.log('Problem generating fishing spots');
        return;
    }
    fish1.timerScript = (npc) => {
        console.log(World.currentTick, 'Fishing spot (fish1) started movement.');
        npc.lastMovement = World.currentTick + 2;
    };
    fish2.timerScript = (npc) => {
        console.log(World.currentTick, 'Fishing spot (fish2) started movement.');
        npc.lastMovement = World.currentTick + 2;
    };

    player.clientInput = (player) => {
        if (player.moveSpeed === MoveSpeed.WALK) {
            console.log(World.currentTick, 'Turned run on.');
            player.activate_run();
        }
        if (!player.target || fish1.lastMovement === World.currentTick - 1 || fish2.lastMovement === World.currentTick - 1) { // if fishing spot moved last tick
            if (fish1.lastMovement === World.currentTick - 1) {
                console.log(World.currentTick, 'Fishing spot (fish1) moved.');
            }
            if (fish2.lastMovement === World.currentTick - 1) {
                console.log(World.currentTick, 'Fishing spot (fish2) moved.');
            }
            const bestFish = player.pick_lumby_fish(fish1, fish2);
            if (bestFish) {
                player.current = bestFish;
                player.opTarget(bestFish, 1);
            }
        }
        if (player.current && player.stepsLeft < 3 && player.action_delay() < World.currentTick) {
            player.tick_fish(player.current, 3);
            return;
        }
    };

    player.interact = (player) => {
        player.ticksInteracted++;
        // console.log(World.currentTick, ': Player at: ', player.x, player.z, ' interacted with ', player.targetOp, player.action_delay());
        if (player.targetOp === 6 && player.action_delay() === World.currentTick) {
            console.log(World.currentTick, ' Roll gained.');
            player.rolls++;
        }
    };
    
    player.move = (player) => {
        player.stepsLeft -= player.stepsTaken;
        // console.log(World.currentTick, ': Moved to: ', player.x, player.z, '. Steps left:', player.stepsLeft);
        player.ticksMoved++;
    };
    let hour = 0;
    let lastxp = player.stats[PlayerStat.FISHING];
    let total_ticksmoved = 0;
    let total_ticksinteracted = 0;
    let total_rolls = 0;
    console.log(ticks);
    while (World.currentTick < ticks) {
        World.cycle();
        if (World.currentTick % 6000 === 0) {
            hour++;

            const xprate = (player.stats[PlayerStat.FISHING] - lastxp) / 10;
            total_rolls += player.rolls;
            total_ticksmoved += player.ticksMoved;
            total_ticksinteracted += player.ticksInteracted;
            lastxp = player.stats[PlayerStat.FISHING];
            console.log('Hour:', hour, ' Rolls:', player.rolls, ' Xp/hr:', Math.floor(xprate), ' Ticks moving:', player.ticksMoved, ' Ticks interacting:', player.ticksInteracted);
            player.rolls = 0;
            player.ticksMoved = 0;
            player.ticksInteracted = 0;
        }
    }
    console.log('Total Hours:', hour, ' Total Rolls:', total_rolls, ' Avg Xp/hr:', (player.stats[PlayerStat.FISHING] - 130344310) / 10 * (6000/ticks), ' Total Ticks moving:', total_ticksmoved, ' Total Ticks interacting:', total_ticksinteracted);
    process.exit(0);
}

// async function simSpiders(ticks: number) {
//     const baseticks = ticks;
//     await World.startSim([{x1: 28*64, z1: 75*64, x2: 28*64+63, z2: 75*64+63}]);

//     const mx = 28*64;
//     const mz = 75*64;
//     const startx = mx + 31;
//     const startz = mz + 16;
//     const endx = mx + 43;
//     const endz = mz + 25;

//     const tiles: {x: number, z: number}[] = [];
//     for (let x = startx; x <= endx; x++) {
//         for (let z = startz; z <= endz; z++) {
//             if (!isMapBlocked(x, z, 0)) {
//                 tiles.push({x: x, z: z});
//             }
//         }
//     }
//     ticks *= tiles.length;
//     let tileindex = 0;
//     let tile = tiles[0];
//     const player = World.addSimPlayer('Tanner', tile.x, tile.z);
//     player.setVar(281, 1000); // complete tutorial island
//     player.setVar(176, 10); // complete drag slay

//     player.setLevel(PlayerStat.ATTACK, 99);
//     player.setLevel(PlayerStat.STRENGTH, 99);
//     player.setLevel(PlayerStat.DEFENCE, 99);
//     player.setLevel(PlayerStat.HITPOINTS, 99);
//     player.setLevel(PlayerStat.RANGED, 99);

//     World.cycle(); // cycle once
//     player.give('rune_scimitar', 1);
//     player.give('rune_platebody', 1);
//     player.give('rune_kiteshield', 1);
//     player.give('rune_platelegs', 1);
//     player.give('amulet_of_strength', 1);
//     player.give('rune_full_helm', 1);
//     player.give('dragon_vambraces', 1);
//     player.give('orange_cape', 1);
//     player.equipAll();
//     player.give('strength4', 7);
//     player.give('swordfish', 21);

//     // console.log('Total npcs: ', World.getTotalNpcs());
//     // console.log('Total players: ', World.getTotalPlayers());
//     // for (const npc of World.npcs) {
//     //     npc.move = (npc) => {
//     //         console.log(npc.nid, npc.x, npc.z);
//     //     }
//     // }


//     player.clientInput = (player) => {
//         if (player.stat(PlayerStat.HITPOINTS) < 85) {
//             if (player.invFreeSpace(InvType.INV) >= 14) {
//                 player.invClear(InvType.INV);
//                 player.give('strength4', 14);
//                 player.give('swordfish', 14);
//             }
//             player.opHeldObj(InvType.INV, 1, 'swordfish', false);
//             player.opHeldObj(InvType.INV, 1, 'strength4', false);
//         }
//     };
//     player.interact = (player) => {
//         if (player.action_delay() - 4 === World.currentTick) {
//             player.rolls++;
//         }
//     };

//     while (World.currentTick < ticks) {
//         World.cycle();
//         if (World.currentTick % baseticks === 0) {
//             // console.log(player.stat(PlayerStat.ATTACK), player.stat(PlayerStat.STRENGTH), player.stat(PlayerStat.DEFENCE), player.stat(PlayerStat.DEFENCE));
//             console.log(`[${tileindex+1}/${tiles.length}] ${tile.x - mx}x, ${tile.z -mz}z, ${Math.floor((player.xp(PlayerStat.ATTACK) - 13034431) * (6000/baseticks))} Xp/hr, ${Math.floor(player.rolls * (6000/baseticks))} Hits/hr`);
//             tileindex++;
//             tile = tiles[tileindex];
//             if (tile) {
//                 if (player.target instanceof Npc) {
//                     player.target.levels[NpcStat.HITPOINTS] = player.target.baseLevels[NpcStat.HITPOINTS];
//                 }
//                 player.setLevel(PlayerStat.ATTACK, 99);
//                 player.setVar(39, 0); // remove combat
//                 player.rolls = 0;
//                 player.teleport(mx, mz, 0); // deaggro
//                 player.stopAction();
//                 player.teleport(tile.x, tile.z, 0);
//             }
//         }
//     }
// }

async function simDog() {
    const { promptTicks } = await import('./sim/SimPrompts.js');
    const { PlayerStat } = await import('./engine/entity/PlayerStat.js');
    const InvType = (await import('./cache/config/InvType.js')).default;
    const LocType = (await import('./cache/config/LocType.js')).default;
    const ObjType = (await import('./cache/config/ObjType.js')).default;
    const World = (await import('./engine/World.js')).default;
    const CAKECAT = 189;

    const ticks = await promptTicks();
    // const usingDoll = await promptQuestion("Include the use of the Iban Doll?");
    
    // edgeville bank, ardy tele, and mine area
    await World.startSim([{x1: 3083, z1: 3488, x2: 3098, z2: 3499}, {x1: 2644, z1: 3300, x2: 2716, z2: 3313}, {x1: 2688, z1: 3313, x2: 2732, z2: 3361}]);
    const mx = 42*64;
    const mz = 52*64;
    const rock1 = World.getLoc(mx + 25, mz + 4, 0, LocType.getId('ironrock1'));
    const rock2 = World.getLoc(mx + 27, mz + 3, 0, LocType.getId('ironrock1'));
    const rock3 = World.getLoc(mx + 26, mz + 2, 0, LocType.getId('ironrock2'));
    const rock4 = World.getLoc(mx + 24, mz + 1, 0, LocType.getId('ironrock2'));
    const rock5 = World.getLoc(mx + 23, mz + 1, 0, LocType.getId('ironrock1'));
    const rock6 = World.getLoc(mx + 22, mz + 0, 0, LocType.getId('ironrock2'));

    if (!rock1 || !rock2 || !rock3 || !rock4 || !rock5 || !rock6) {
        console.log('cant find rock locs');
        return;
    }
    // const rockCycle = [rock1, rock2, rock3, rock4, rock5, rock6];

    const bank = World.getLoc(48*64 + 23, 54*64 + 35, 0, 2213);

    if (!bank) {
        console.log('cant find bank');
        return;
    }
    const bears: Npc[] = [];
    for (const npc of World.npcs) {
        if (npc.type === 105 && (npc.coordWithinMaxrange({x: mx + 21, z: mz + 0, level: 0}) && npc.coordWithinMaxrange({x: mx + 26, z: mz + 3, level: 0}))) {
            bears.push(npc);
        }
    }
    if (!bears) {
        console.log('cant find bears');
        return;
    }

    const player = World.addSimPlayer('Tanner', 3094, 3491); // edge bank
    player.setLevel(PlayerStat.DEFENCE, 99);
    player.setLevel(PlayerStat.HITPOINTS, 99);
    player.setLevel(PlayerStat.RANGED, 99);
    player.setLevel(PlayerStat.MINING, 99);
    player.setLevel(PlayerStat.MAGIC, 99);
    player.setLevel(PlayerStat.AGILITY, 99);
    player.setVar(165, 30); // elena progress

    player.login = (player) => {
        console.log(`${World.currentTick}: Logged in`);
        player.give('amulet_of_glory_4', 1);
        player.give('magic_shortbow', 1);
        player.equipAll();
        player.give('rune_pickaxe', 1);
        player.give('amulet_of_glory_4', 1);
        player.inv_add(95, 'amulet_of_glory_4', 10000000);
        player.inv_add(95, 'lawrune', 10000000);
        player.inv_add(95, 'waterrune', 10000000);
        player.inv_add(95, 'cake', 10000000);
        player.inv_add(95, 'bronze_arrow', 10000000);

        player.wait(0, (player) => {
            // console.log(`${World.currentTick}: look for bank (1)`);
            player.opIfButton(1770); // rapid
            player.opTarget(bank, 2);
        });
    };

    player.clientInput = (player) => {
        player.processInputQueues();
        if (player.delayed) {
            return;
        }
        if (player.z >= mz && player.z <= mz+64) {
            // console.log(`${World.currentTick}: inv_freespace ${player.invFreeSpace(InvType.INV)}, cakes ${player.invTotalCat(InvType.INV, CAKECAT)}`);
            if (player.invFreeSpace(InvType.INV) === 0 && player.invTotalCat(InvType.INV, CAKECAT) == 0) {
                player.opHeldSlot(InvType.INV, 4, 1, true);
                player.current = null;
                player.clearInputs();
                player.inputQueue(0, (player) => {player.opIfButton(2494);});
                player.wait(0, (player) => {player.opTarget(bank, 2);});
                return;
            }
            if (!player.current) {
                player.current = player.npc_find(bears, player, {x: mx+26, z: mz+3, level: 0});
            }
        } else if (player.z >= 51*64+57 && player.z <= mz+64) {
            player.activate_walk();
        } else if (player.runenergy >= 100 && !player.containsModalInterface() && !player.run) {
            player.activate_run();
        }
        if (player.busy2()) {
            return;
        }
        if (player.waiting()) {
            return;
        }
        if (player.banking()) { // server only processes 5 packets at a time
            // console.log(World.currentTick, 'banking');
            player.bank_deposit('iron_ore');
            player.bank_deposit('uncut_sapphire');
            player.bank_deposit('uncut_emerald');
            player.bank_deposit('uncut_diamond');
            player.bank_deposit('uncut_ruby');
            player.wait(0, (player) => {
                if (player.invTotal(InvType.INV, ObjType.getId('amulet_of_glory')) > 0) {
                    player.bank_deposit('amulet_of_glory');
                    player.bank_withdraw('amulet_of_glory_4', 1);
                }
                player.bank_withdraw('cake', 1);
                player.bank_withdraw('cake', 1);
                player.bank_withdraw('lawrune', 1);
            });

            player.wait(0, (player) => {
                player.bank_withdraw('lawrune', 1);
                player.bank_withdraw('waterrune', 1);
                player.bank_withdraw('waterrune', 1);
                player.bank_withdraw('bronze_arrow', 1);
                player.closeModal();
            });
            player.wait(0, (player) => {
                player.opIfButton(1540); // ardy tele
            });
            player.wait(0, (player) => { // do this instantly after teleporting
                player.opMoveTo(mx+21, mz+0);
                player.equip('bronze_arrow');
            });
            player.wait(0, (player) => {
                player.opTarget(rock6, 1);
            });
            player.wait(0, (player) => {
                if (!player.current) {
                    player.opTarget(rock5, 1);
                } else {
                    player.opTarget(player.current, 2);
                    player.inputQueue(0, (player) => {player.opTarget(rock5, 1);});
                }
            });

            // rock 1
            player.wait(0, (player) => {
                player.activate_run();
                if (!player.current) {
                    player.opMoveTo(mx+25, mz+3);
                } else {
                    player.opTarget(player.current, 2);
                    player.inputQueue(0, (player) => {player.opMoveTo(mx+25, mz+3);});
                }
            });
            player.wait(0, (player) => {
                player.activate_walk();
                player.opTarget(rock1, 1);
            });

            // rock 2
            player.wait(0, (player) => {
                player.opHeldCat(InvType.INV, 1, 'cake');
                player.opTarget(rock2, 1);
            });

            // rock 3
            player.wait(0, (player) => {player.opTarget(rock3, 1);});

            // rock 4
            player.wait(0, (player) => {
                if (!player.current) {
                    player.opMoveTo(mx+24,mz+2);
                } else {
                    player.opTarget(player.current, 2);
                    player.inputQueue(0, (player) => {player.opMoveTo(mx+24,mz+2);});
                }
            });
            player.wait(0, (player) => {
                player.opTarget(rock4, 1);
            });

            // rock 5
            player.wait(0, (player) => {
                if (!player.current) {
                    player.opMoveTo(mx+23,mz+2);
                } else {
                    player.opTarget(player.current, 2);
                    player.inputQueue(0, (player) => {player.opMoveTo(mx+23,mz+2);});
                }
            });
            player.wait(0, (player) => {
                player.opTarget(rock5, 1);
            });

            // rock 6
            player.wait(0, (player) => {
                if (!player.current) {
                    player.opMoveTo(mx+22,mz+1);
                } else {
                    player.opTarget(player.current, 2);
                    player.inputQueue(0, (player) => {player.opMoveTo(mx+22,mz+1);});
                }
            });
            player.wait(0, (player) => {
                player.opTarget(rock6, 1);
            });
            for (let i = 0; i < 4; i++) {
                // rock 1
                player.wait(0, (player) => {
                    player.activate_run();
                    if (!player.current) {
                        player.opMoveTo(mx+25, mz+3);
                    } else {
                        player.opTarget(player.current, 2);
                        player.inputQueue(0, (player) => {player.opMoveTo(mx+25, mz+3);});
                    }
                });
                player.wait(0, (player) => {
                    player.activate_walk();
                    player.opTarget(rock1, 1);
                });

                // rock 2
                player.wait(0, (player) => {
                    player.opHeldCat(InvType.INV, 1, 'cake');
                    if (player.invFreeSpace(InvType.INV) === 0) { // if inv full, drop the cake part
                        player.opHeldCat(InvType.INV, 5, 'cake');
                    }
                    player.opTarget(rock2, 1);
                });

                // rock 3
                player.wait(0, (player) => {player.opTarget(rock3, 1);});

                // rock 4
                player.wait(0, (player) => {
                    if (!player.current) {
                        player.opMoveTo(mx+24,mz+2);
                    } else {
                        player.opTarget(player.current, 2);
                        player.inputQueue(0, (player) => {player.opMoveTo(mx+24,mz+2);});
                    }
                });
                player.wait(0, (player) => {
                    player.opTarget(rock4, 1);
                });

                // rock 5
                player.wait(0, (player) => {
                    player.opHeldCat(InvType.INV, 1, 'cake');
                    if (player.invFreeSpace(InvType.INV) === 0) { // if inv full, drop the cake part
                        player.opHeldCat(InvType.INV, 5, 'cake');
                    }
                    player.opTarget(rock5, 1);
                });

                // rock 6
                player.wait(0, (player) => {
                    if (!player.current) {
                        player.opMoveTo(mx+22,mz+1);
                    } else {
                        player.opTarget(player.current, 2);
                        player.inputQueue(0, (player) => {player.opMoveTo(mx+22,mz+1);});
                    }
                });
                player.wait(0, (player) => {
                    player.opTarget(rock6, 1);
                });
            }
            return;
        }

    };

    while (World.currentTick < ticks) {
        World.cycle();
    }
    console.log(`Ticks: ${ticks}, Xp gained: ${player.xp(PlayerStat.MINING) - 13034431}`);
    process.exit(0);
}