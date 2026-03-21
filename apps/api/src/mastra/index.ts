
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter, SensitiveDataFilter } from '@mastra/observability';
import { findWorkspaceRoot, getPackageRoot } from '../config/path-utils.js';
import { runMigrations } from '../identity/migrate.js';
import { initPersonalityStore } from '../identity/store.js';
import { telegramRoutes } from './routes/telegram-routes.js';
import { genericAgent } from './agents/generic-agent.js';
import { sovereignAgent } from './agents/sovereign.js';
import { weatherWorkflow } from './workflows/weather-workflow.js';
import { dailyBriefingWorkflow } from './workflows/daily-briefing-workflow.js';
import { weatherAgent } from './agents/weather-agent.js';

const packageRoot = getPackageRoot(import.meta.url);
const workspaceRoot = findWorkspaceRoot(packageRoot);
const storageDirectory = join(workspaceRoot, '.data');
const storagePath = join(storageDirectory, 'mastra.db');
const personalityDbPath = join(storageDirectory, 'personality.db');

mkdirSync(storageDirectory, { recursive: true });

// Initialize personality DB and run schema migrations
const personalityClient = createClient({ url: `file:${personalityDbPath}` });
initPersonalityStore(personalityClient);
await runMigrations(personalityClient);

export const mastra = new Mastra({
  workflows: { weatherWorkflow, dailyBriefingWorkflow },
  agents: { genericAgent, weatherAgent, sovereign: sovereignAgent },
  server: {
    apiRoutes: telegramRoutes,
  },
  storage: new LibSQLStore({
    id: "mastra-storage",
    // stores observability, scores, ... into persistent file storage
    url: `file:${storagePath}`,
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new DefaultExporter(), // Persists traces to storage for Mastra Studio
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
