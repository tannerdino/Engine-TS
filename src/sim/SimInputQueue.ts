import Linkable from '#/util/Linkable.js';
import { PlayerSimScript } from './SimPlayer.js';

export class SimInputQueue extends Linkable {
    script: PlayerSimScript;
    worldTick: number;

    constructor(worldTick: number, script: PlayerSimScript) {
        super();
        this.worldTick = worldTick;
        this.script = script;
    }
}
