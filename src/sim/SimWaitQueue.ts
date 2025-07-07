import Linkable from '#/util/Linkable.js';
import { PlayerSimScript } from './SimPlayer.js';

export class SimWaitQueue extends Linkable {
    script: PlayerSimScript;
    delay: number;

    constructor(delay: number, script: PlayerSimScript) {
        super();
        this.delay = delay;
        this.script = script;
    }
}
