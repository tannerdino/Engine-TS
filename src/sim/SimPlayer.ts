/* tslint:disable */
/* eslint-disable */

import Component from '#/cache/config/Component.js';
import InvType from '#/cache/config/InvType.js';
import { CoordGrid } from '../engine/CoordGrid.js';
import ScriptProvider from '../engine/script/ScriptProvider.js';
import ScriptRunner from '../engine/script/ScriptRunner.js';
import ServerTriggerType from '../engine/script/ServerTriggerType.js';
import World from '../engine/World.js';
import Entity from '../engine/entity/Entity.js';
import Loc from '../engine/entity/Loc.js';
import Npc from '../engine/entity/Npc.js';
import Obj from '../engine/entity/Obj.js';
import Player from '../engine/entity/Player.js';
import { findPath, isLineOfSight } from '#/engine/GameMap.js';
import ObjType from '#/cache/config/ObjType.js';
import OutgoingMessage from '#/network/game/server/OutgoingMessage.js';
import { ModalState } from '#/engine/entity/ModalState.js';

export type PlayerSimScript = (player: SimPlayer, arg?: number) => void;
export type NpcSimScript = (npc: Npc) => void;
type PlayerSimWait = {tick: number, script: PlayerSimScript};

export class SimPlayer extends Player {
    static readonly ACTION_DELAY = 58;
    static readonly ACTIVATE_RUN_COM = 153;
    int = 0;
    stepsLeft = 0;
    rolls = 0;
    ticksMoved = 0;
    ticksInteracted = 0;
    eats = 0;
    waits: PlayerSimWait[] = [];
    inputQueues: PlayerSimWait[] = [];
    current: Npc | null = null;
    locCycle: Loc[] = [];
    locCycleIndex = 0;
    clientInput: PlayerSimScript | null = null;
    interact: PlayerSimScript | null = null;
    move: PlayerSimScript | null = null;
    levelup: PlayerSimScript | null = null;
    login: PlayerSimScript | null = null;

    override isSim(): this is SimPlayer {
        return true;
    }

    override onLogin() {
        const loginTrigger = ScriptProvider.getByTriggerSpecific(ServerTriggerType.LOGIN, -1, -1);
        if (loginTrigger) {
            this.executeScript(ScriptRunner.init(loginTrigger, this), true);
        }
        if (this.login) {
            this.login(this);
        }
        this.lastStepX = this.x - 1;
        this.lastStepZ = this.z;
        this.isActive = true;
    }
    override onReconnect(): void {
        // nothing
    }

    override write(message: OutgoingMessage): void {
        // nothing
    }
    wait(ticks: number, waitScript: PlayerSimScript) {
        if (this.waits.length < 1) {
            this.waits.push({tick: World.currentTick + ticks, script: waitScript});
            return;
        }
        this.waits.push({tick: this.waits[this.waits.length - 1].tick + ticks, script: waitScript});
    }
    waiting(): boolean {
        for (let i = 0; i < this.waits.length; i++) {
            const wait = this.waits[i];
            if (wait.tick <= World.currentTick) { 
                const diff = World.currentTick - wait.tick;
                wait.script(this);
                this.waits.slice(i);
                if (diff > 0) {
                    for (let j = 0; j < this.waits.length; j++) {
                        this.waits[j].tick += diff; // if delayed, or otherwise missed, increase every current wait by the diff
                    }
                }
                return true;
            }
        }
        return false;
    }
    inputQueue(ticks: number, queueScript: PlayerSimScript) {
        this.inputQueues.push({tick: World.currentTick + ticks, script: queueScript});
    }
    processInputQueues() {
        if (this.delayed) {
            return;
        }
        for (let i = 0; i < this.inputQueues.length; i++) {
            const intputQueue = this.inputQueues[i];
            if (intputQueue.tick <= World.currentTick) { 
                intputQueue.script(this);
                this.inputQueues.slice(i);
            }
        }
    }
    clearInputs() {
        this.inputQueues = [];
        this.waits = [];
    }
    busy2(): boolean {
        return this.hasInteraction() || this.hasWaypoints();
    }
    banking(): boolean {
        return this.modalMain === 5292 && this.modalState === ModalState.MAIN;
    }
    bank_withdraw(obj: string, count: number) {
        if (count === 1) {
            this.opInvButton(5382, obj, 1);
        } else {
            this.opInvButton(5382, obj, 4); // all
        }   
    }
    bank_deposit(obj: string) {
        this.opInvButton(2006, obj, 4);
    }
    wilderness_course_progress() {
        return Number(this.getVar(266));
    }

    action_delay(): number {
        return Number(this.getVar(SimPlayer.ACTION_DELAY));
    }
    activate_run() {
        this.opIfButton(SimPlayer.ACTIVATE_RUN_COM);
    }
    activate_walk() {

    }
    destination(): CoordGrid | null { 
        return CoordGrid.unpackCoord(this.waypoints[this.waypointIndex]);
    }
    xp(stat: number): number {
        return this.stats[stat] / 10;
    }
    stat(stat:number): number {
        return this.levels[stat];
    }
    give(obj: string, count: number) {
        this.invAdd(InvType.INV, ObjType.getId(obj), count);
    }
    inv_add(inv: number, obj: string, count: number) {
        this.invAdd(inv, ObjType.getId(obj), count);
    }
    equipAll() {
        for (let slot = 0; slot < this.invSize(InvType.INV); slot++) {
            this.opHeldSlot(InvType.INV, 2, slot);
        }
    }
    equip(obj: string) {
        this.opHeldObj(InvType.INV, 2, obj, true);
    }
    opIfButton(comId: number) {
        const com = Component.get(comId);
        const root = Component.get(com.rootLayer);
        const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.IF_BUTTON, comId, -1);
        if (script) {
            this.executeScript(ScriptRunner.init(script, this), root.overlay == false);
        }
    }
    opInvButton(comId: number, obj: string, op: number) {
        if (this.delayed) {
            return false;
        }
        const type = ObjType.getByName(obj);
        if (!type) {
            return;
        }

        const listener = this.invListeners.find(l => l.com === comId);
        if (!listener) {
            return false;
        }
        const inv = this.getInventoryFromListener(listener);
        if (!inv) {
            return;
        }
        const slot = inv.getItemIndex(type.id);
        if (slot == -1) {
            return;
        }

        this.lastItem = type.id;
        this.lastSlot = slot;

        const script = ScriptProvider.getByTrigger(ServerTriggerType.INV_BUTTON1 + op - 1, type.id, type.category);
        if (script) {
            const root = Component.get(Component.get(comId).rootLayer);
            this.executeScript(ScriptRunner.init(script, this), root.overlay == false);
        }

    }
    opHeldObj(invId: number, op:number, obj: string, clearaction: boolean = true) {
        if (this.delayed) {
            return;
        }
        if (clearaction) {
            this.clearPendingAction();
        }
        const inv = this.getInventory(invId);
        if (!inv) {
            return;
        }
        const type = ObjType.getByName(obj);
        if (!type) {
            return;
        }
        const slot = inv.getItemIndex(type.id);
        if (slot == -1) {
            return;
        }
        this.lastItem = type.id;
        this.lastSlot = slot;
        const script = ScriptProvider.getByTrigger(ServerTriggerType.OPHELD1 + op - 1, type.id, type.category);
        if (script) {
            this.executeScript(ScriptRunner.init(script, this), true);
            return true;
        }
    }
    opHeldSlot(invId: number, op:number, slot: number, clearaction: boolean = true) {
        if (this.delayed) {
            return;
        }
        if (clearaction) {
            this.clearPendingAction();
        }
        const inv = this.getInventory(invId);
        if (!inv) {
            return;
        }
        const item = inv.get(slot);
        if (!item) {
            return;
        }
        this.lastItem = item.id;
        this.lastSlot = slot;
        const type = ObjType.get(item.id);
        const script = ScriptProvider.getByTrigger(ServerTriggerType.OPHELD1 + op - 1, type.id, type.category);
        if (script) {
            this.executeScript(ScriptRunner.init(script, this), true);
        }
    }
    opTarget(target: Entity, op: number, com?: number) {
        this.clearPendingAction();
        if (!target) {
            return;
        }
        if (!target.isActive) {
            return;
        }
        if (target instanceof Npc && target.delayed) {
            return;
        }
        op -= 1;
        if (target instanceof Npc) {
            this.targetOp = ServerTriggerType.APNPC1 + op;
        } else if (target instanceof Loc) {
            this.targetOp = ServerTriggerType.APLOC1 + op;
        } else if (target instanceof Player) {
            this.targetOp = ServerTriggerType.APPLAYER1 + op;
        } else if (target instanceof Obj) {
            this.targetOp = ServerTriggerType.APOBJ1 + op;
        } else {
            return;
        }
        this.target = target;
        this.apRange = 10;
        this.apRangeCalled = false;

        this.targetSubject.com = com ? com : -1;
        // Remember initial target type for validation
        if (target instanceof Npc || target instanceof Loc || target instanceof Obj) {
            this.targetSubject.type = target.type;
        } else {
            this.targetSubject.type = -1;
        }
        this.pathToTarget();
    }
    opMoveTo(x: number, z: number) {
        if (this.delayed) {
            return;
        }
        this.clearPendingAction();
        this.queueWaypoints(findPath(this.level, this.x, this.z, x, z));
        if (this.hasWaypoints()) {
            this.processWalktrigger();
        }
    }
    opMoveOrTarget(target: Entity, op: number, x: number, z: number) {
        if (this.x === x && this.z === z) {
            this.opTarget(target, op);
            return;
        }
        this.opMoveTo(x, z);
    }
    override queueWaypoints(waypoints: ArrayLike<number>): void {
        let index: number = -1;
        const start = {x: this.x, z: this.z};
        let previous: { x: number, z: number } = start;
        this.stepsLeft = 0;
        for (let input: number = waypoints.length - 1, output: number = 0; input >= 0 && output < this.waypoints.length; input--, output++) {
            this.waypoints[output] = waypoints[input];
            index++;

            // Step counting logic
            const current = CoordGrid.unpackCoord(waypoints[input]);
            const dx = Math.abs(current.x - previous.x);
            const dz = Math.abs(current.z - previous.z);
            this.stepsLeft += Math.max(dx, dz);
            previous = current;
        }
        // console.log(World.currentTick, ': Queued waypoints from ', start.x, start.z, ' to ', previous.x, previous.z, ' Steps:', this.stepsLeft);
        this.waypointIndex = index;
    }

    tick_fish(fish: Npc, delay:number) {
        // this.clearPendingAction();
        console.log(World.currentTick, ' 3 ticked.');
        this.invDelSlot(InvType.INV, 2);
        this.setVar(SimPlayer.ACTION_DELAY, World.currentTick + delay - 1);
        this.opTarget(fish, ServerTriggerType.APNPC1);
    }

    pick_barb_fish(fish1: Npc, fish2: Npc): Npc {
        const current = this.current_barb_fish(fish1, fish2);
        if (current) {
            const other = current === fish1 ? fish2 : fish1;
            if (current.x == 3110) {
                if (other.x === 3104) {
                    return current;
                }
                if (current.z === 3432 && this.x === 3109 && this.z === 3432) { // if current is bad spot
                    if (other.lastMovement < current.lastMovement) {
                        return other;
                    }
                }
            } else if (other.x === 3104) {
                if (other.lastMovement < current.lastMovement) {
                    return other;
                }
            }
            return current;
        }
        if (CoordGrid.distanceTo(this, fish1) < CoordGrid.distanceTo(this, fish2)) {
            return fish1;
        }
        return fish2;
    }

    // pick_barb_fish(fish1: Npc, fish2: Npc): Npc {
    //     const current = this.current_barb_fish(fish1, fish2);
    //     if (current) {
    //         if (current.x === 3110) { // if current is north
    //             const other = current === fish1 ? fish2 : fish1;
    //             if (other.x === 3104) { // if other is south
    //                 return current;
    //             }
    //             if (current.z === 3432 && this.x === 3109 && this.z === 3432) { // if current is bad spot
    //                 if (other.lastMovement < current.lastMovement) { // if current is due to move at least 1 tick
    //                     return other;
    //                 }
    //             }
    //         }
    //         return current;
    //     }
    //     if (CoordGrid.distanceTo(this, fish1) < CoordGrid.distanceTo(this, fish2)) {
    //         return fish1;
    //     }
    //     return fish2;
    // }
    pick_lumby_fish(fish1: Npc, fish2: Npc): Npc | null {
        const current = this.current_lumby_fish(fish1, fish2);
        const center = {x: 3238, z: 3248};
        if (current) {
            const other = current === fish1 ? fish2 : fish1;
            if (other.x != current.x) {
                return current;
            }
            if (CoordGrid.distanceToSW(center, other) < CoordGrid.distanceToSW(center, current) && CoordGrid.distanceToSW(other, current) <= 2) {
                return other;
            }
            return current;
        }
        if (CoordGrid.distanceToSW(this, fish1) < CoordGrid.distanceToSW(this, fish2)) {
            return fish1;
        }
        return fish2;
    }

    current_lumby_fish(fish1: Npc, fish2: Npc): Npc | null {
        if (fish1.x - this.x === -1) {
            return fish1;
        }
        if (fish2.x - this.x === -1) {
            return fish2;
        }
        return this.current;
    }

    current_barb_fish(fish1: Npc, fish2: Npc): Npc | null {
        if (fish1.x - this.x === 1) {
            return fish1;
        }
        if (fish2.x - this.x === 1) {
            return fish2;
        }
        return null;
    }

    updateMap() {
        // map zone changed
        const mapZone = CoordGrid.packCoord(0, (this.x >> 6) << 6, (this.z >> 6) << 6);
        if (this.lastMapZone !== mapZone) {
            // map zone triggers
            if (this.lastMapZone !== -1) {
                const { x, z } = CoordGrid.unpackCoord(this.lastMapZone);
                this.triggerMapzoneExit(x, z);
            }

            this.triggerMapzone((this.x >> 6) << 6, (this.z >> 6) << 6);
            this.lastMapZone = mapZone;
        }

        // zone changed
        const zone = CoordGrid.packCoord(this.level, (this.x >> 3) << 3, (this.z >> 3) << 3);
        if (this.lastZone !== zone) {
            // zone triggers
            const lastWasMulti = World.gameMap.isMulti(this.lastZone);
            const nowIsMulti = World.gameMap.isMulti(zone);

            if (this.lastZone !== -1) {
                const { level, x, z } = CoordGrid.unpackCoord(this.lastZone);
                this.triggerZoneExit(level, x, z);
            }

            this.triggerZone(this.level, (this.x >> 3) << 3, (this.z >> 3) << 3);
            this.lastZone = zone;
        }
    }

    npc_find_closest(npcs: Npc[], coord: CoordGrid = this): Npc | null {
        let closestNpc: Npc | null = null;
        let closestDist = Number.MAX_SAFE_INTEGER;
        for (const npc of npcs) {
            const dist = CoordGrid.distanceToSW(npc, {x: coord.x, z: coord.z});
            if (dist < closestDist) {
                closestNpc = npc;
                closestDist = dist;
            }
        }
        return closestNpc;
    }
    npc_find_los(npcs: Npc[], coord: CoordGrid = this): Npc | null {
        for (const npc of npcs) {
            if (isLineOfSight(0, coord.x, coord.z, npc.x, npc.z)) {
                return npc;
            }
        }
        return null;
    }
    npc_find_los2(npcs: Npc[], coord: CoordGrid = this, coord2: CoordGrid): Npc | null {
        for (const npc of npcs) {
            if (isLineOfSight(0, coord.x, coord.z, npc.x, npc.z) && isLineOfSight(0, coord2.x, coord2.z, npc.x, npc.z)) {
                return npc;
            }
        }
        return null;
    }
    npc_find(npcs: Npc[], coord: CoordGrid = this, coord2: CoordGrid | null = null) {
        if (coord2) {
            const npc1 = this.npc_find_los2(npcs, coord, coord2);
            if (npc1) {
                return npc1;
            }
        }
        const npc2 = this.npc_find_los(npcs, coord);
        if (npc2) {
            return npc2;
        }
        return this.npc_find_closest(npcs, coord);
    }
    calc_loc_cycle(locs: Loc[]) {

    }
}
