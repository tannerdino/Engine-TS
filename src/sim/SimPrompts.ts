import { PlayerStatNameMap } from '#/engine/entity/PlayerStat.js';
import prompts from 'prompts';

export async function promptTicks(): Promise<number> {
    const { ticks } = await prompts({
        type: 'number',
        name: 'ticks',
        message: 'How many ticks should the simulation run?',
        initial: 6000,
        min: 1,
    });
    return ticks;
}

export async function promptStatXpGoal(stat: number): Promise<{ start: number; end: number }> {
    const statname = PlayerStatNameMap.get(stat);
    const { startXp } = await prompts({
        type: 'number',
        name: 'startXp',
        message: `Enter starting ${statname} xp:`,
        min: 0,
        max: 200_000_000 - 1
    });

    const { endXp } = await prompts({
        type: 'number',
        name: 'endXp',
        message: `Enter ending ${statname} xp:`,
        min: startXp,
        max: 200_000_000
    });

    return { start: startXp, end: endXp };
}

export async function promptStatLevelGoal(stat: number): Promise<{ start: number; end: number}> {
    const statname = PlayerStatNameMap.get(stat);
    const { startLevel } = await prompts({
        type: 'number',
        name: 'startLevel',
        message: `Enter starting ${statname} level:`,
        min: 0,
        max: 98
    });

    const { endLevel } = await prompts({
        type: 'number',
        name: 'endLevel',
        message: `Enter ending ${statname} level:`,
        min: startLevel,
        max: 99
    });
    return {start: startLevel, end: endLevel};
}

export async function promptStatXp(stat: number): Promise<number> {
    const response = await prompts( {
        type: 'number',
        name: 'level',
        message: `Enter ${PlayerStatNameMap.get(stat)} xp:`,
        initial: 1,
        min: 1,
        max: 99
    });
    return response.level;
}

export async function promptStatLevel(stat: number): Promise<number> {
    const response = await prompts( {
        type: 'number',
        name: 'level',
        message: `Enter ${PlayerStatNameMap.get(stat)} level:`,
        initial: 1,
        min: 1,
        max: 99
    });
    return response.level;
}

export async function promptQuestion(question: string): Promise<boolean> {
    const response = await prompts({
        type: 'confirm',
        name: 'answer',
        message: `${question} (Y/N)`,
        initial: false // default to 'No'
    });

    return response.answer === true;
}
