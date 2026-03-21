import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { schedule, type ScheduledTask } from 'node-cron';
import type { Mastra } from '@mastra/core/mastra';
import { findWorkspaceRoot, getPackageRoot } from './config/path-utils.js';
import { getBriefingChatId } from './telegram/telegram-push.js';

type HeartbeatTask = {
    description: string;
    cronSchedule: string;
    enabled: boolean;
    workflowId: string;
};

const scheduledTasks: ScheduledTask[] = [];

/**
 * Parse tasks from HEARTBEAT.md.
 * Each task block must contain all four fields: Schedule, Enabled, Workflow, Description.
 */
function parseHeartbeat(markdown: string): HeartbeatTask[] {
    const tasks: HeartbeatTask[] = [];

    // Split on H2 headings (## Task Name)
    const blocks = markdown.split(/^##\s+/m).slice(1);

    for (const block of blocks) {
        const descMatch = block.match(/\*\*Description:\*\*\s*(.+)/);
        const scheduleMatch = block.match(/\*\*Schedule:\*\*\s*`([^`]+)`/);
        const enabledMatch = block.match(/\*\*Enabled:\*\*\s*(true|false)/i);
        const workflowMatch = block.match(/\*\*Workflow:\*\*\s*`?([^\s`\n]+)`?/);

        if (!descMatch || !scheduleMatch || !enabledMatch || !workflowMatch) {
            continue;
        }

        tasks.push({
            description: descMatch[1].trim(),
            cronSchedule: scheduleMatch[1].trim(),
            enabled: enabledMatch[1].toLowerCase() === 'true',
            workflowId: workflowMatch[1].trim(),
        });
    }

    return tasks;
}

/**
 * Build the input data for a given workflow trigger.
 * Returns undefined if the workflow should not be run (e.g. missing required config).
 */
function buildWorkflowInput(workflowId: string): Record<string, unknown> | undefined {
    if (workflowId === 'daily-briefing') {
        const chatId = getBriefingChatId();

        if (!chatId) {
            console.warn(
                '[heartbeat] daily-briefing: TELEGRAM_BRIEFING_CHAT_ID is not set — skipping briefing delivery',
            );
        }

        // resourceId defaults to the numeric chat ID for single-user setups.
        // In a multi-user setup, iterate over registered users instead.
        const resourceId = process.env.BRIEFING_RESOURCE_ID?.trim()
            ?? (chatId ? `tg-user-${chatId}` : undefined);

        if (!resourceId) {
            console.warn(
                '[heartbeat] daily-briefing: Could not determine a resourceId. ' +
                'Set BRIEFING_RESOURCE_ID or TELEGRAM_BRIEFING_CHAT_ID.',
            );
            return undefined;
        }

        return { resourceId, telegramChatId: chatId };
    }

    return {};
}

/**
 * Start all enabled scheduled tasks defined in HEARTBEAT.md.
 * Safe to call multiple times — existing tasks are stopped first.
 */
export async function startScheduler(mastra: Mastra): Promise<void> {
    // Stop any previously scheduled tasks (e.g. on hot reload)
    for (const task of scheduledTasks) {
        task.stop();
    }
    scheduledTasks.length = 0;

    const packageRoot = getPackageRoot(import.meta.url);
    const workspaceRoot = findWorkspaceRoot(packageRoot);

    // Look for HEARTBEAT.md next to this package first, then workspace root
    const candidates = [
        join(packageRoot, 'HEARTBEAT.md'),
        join(workspaceRoot, 'HEARTBEAT.md'),
    ];

    const heartbeatPath = candidates.find(p => existsSync(p));

    if (!heartbeatPath) {
        console.info('[heartbeat] No HEARTBEAT.md found — no scheduled tasks will run');
        return;
    }

    const markdown = readFileSync(heartbeatPath, 'utf-8');
    const tasks = parseHeartbeat(markdown);

    console.info(`[heartbeat] Found ${tasks.length} task(s) in ${heartbeatPath}`);

    for (const task of tasks) {
        if (!task.enabled) {
            console.info(`[heartbeat] Skipping disabled task: ${task.description}`);
            continue;
        }

        const workflow = mastra.getWorkflow(task.workflowId);

        if (!workflow) {
            console.warn(`[heartbeat] Workflow "${task.workflowId}" not registered in Mastra — skipping`);
            continue;
        }

        console.info(
            `[heartbeat] Scheduling "${task.description}" — cron: ${task.cronSchedule} — workflow: ${task.workflowId}`,
        );

        const cronTask = schedule(task.cronSchedule, async () => {
            console.info(`[heartbeat] Triggering "${task.description}" (${task.workflowId})`);

            const inputData = buildWorkflowInput(task.workflowId);

            if (inputData === undefined) {
                console.warn(`[heartbeat] Skipping "${task.description}" — missing required configuration`);
                return;
            }

            try {
                const run = await workflow.createRun();
                const result = await run.start({ inputData });

                if (result.status === 'success') {
                    console.info(`[heartbeat] "${task.description}" completed successfully`);
                } else {
                    console.error(`[heartbeat] "${task.description}" finished with status: ${result.status}`, result);
                }
            } catch (error) {
                console.error(`[heartbeat] "${task.description}" threw an error:`, error);
            }
        });

        scheduledTasks.push(cronTask);
    }

    const activeCount = scheduledTasks.length;
    console.info(`[heartbeat] Scheduler started — ${activeCount} active task(s)`);
}
