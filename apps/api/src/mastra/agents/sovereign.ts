import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { buildInstructions } from '../../identity/instructions.js';
import { getPersonalityStore } from '../../identity/store.js';
import { calendarTool } from '../tools/calendar-tool.js';

const WORKING_MEMORY_TEMPLATE = `# Active Context
- Current focus/priority:
- Key deadlines:
- Active threads (waiting on X from Y):
- Temporary context (travel, PTO, etc.):
- Recent decisions and rationale:
`;

export const sovereignAgent = new Agent({
    id: 'sovereign',
    name: 'Sovereign',
    instructions: async ({ requestContext }) => {
        const resourceId = requestContext.get('resource-id') as string | undefined;
        return buildInstructions(resourceId ?? 'unknown', getPersonalityStore());
    },
    model: 'openrouter/openai/gpt-5-mini',
    tools: { calendarTool },
    memory: new Memory({
        options: {
            workingMemory: {
                enabled: true,
                scope: 'resource',
                template: WORKING_MEMORY_TEMPLATE,
            },
            lastMessages: 20,
        },
    }),
});
