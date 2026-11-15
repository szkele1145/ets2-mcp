/**
 * ETS2 MCP Server - Entry Point
 * Model Context Protocol server for Euro Truck Simulator 2 telemetry
 */

import { Ets2McpServer } from './mcp-server.js';
import { DEFAULT_TELEMETRY_CONFIG } from './types.js';

async function main() {
  // Parse command line arguments for configuration
  const args = process.argv.slice(2);
  const config: Record<string, string> = {};
  
  for (let i = 0; i < args.length; i += 2) {
    if (args[i].startsWith('--')) {
      config[args[i].slice(2)] = args[i + 1];
    }
  }

  const serverConfig = {
    host: config.host || DEFAULT_TELEMETRY_CONFIG.host,
    port: parseInt(config.port) || DEFAULT_TELEMETRY_CONFIG.port,
    endpoint: config.endpoint || DEFAULT_TELEMETRY_CONFIG.endpoint,
    updateInterval: parseInt(config.interval) || DEFAULT_TELEMETRY_CONFIG.updateInterval,
    timeout: parseInt(config.timeout) || DEFAULT_TELEMETRY_CONFIG.timeout,
  };

  const server = new Ets2McpServer(serverConfig);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('\n[ETS2 MCP] Shutting down...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('\n[ETS2 MCP] Shutting down...');
    await server.stop();
    process.exit(0);
  });

  try {
    await server.start();
  } catch (error) {
    console.error('[ETS2 MCP] Failed to start:', error);
    process.exit(1);
  }
}

main();