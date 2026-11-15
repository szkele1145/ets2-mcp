/**
 * ETS2 MCP Server
 * Exposes ETS2 telemetry data and control capabilities via Model Context Protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { TelemetryClient } from './telemetry-client.js';
import { BridgeClient } from './bridge-client.js';
import {
  TelemetryConfig,
  TelemetrySnapshot,
  TruckData,
  TrailerData,
  JobData,
  NavigationData,
  WeatherData,
  GpsData,
  DEFAULT_TELEMETRY_CONFIG,
} from './types.js';

export class Ets2McpServer {
  private server: Server;
  private telemetryClient: TelemetryClient;
  private bridgeClient: BridgeClient;
  private config: TelemetryConfig;

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = { ...DEFAULT_TELEMETRY_CONFIG, ...config };
    this.telemetryClient = new TelemetryClient(this.config);
    this.bridgeClient = new BridgeClient();
    this.server = new Server(
      {
        name: 'ets2-telemetry',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
    this.setupTelemetryEvents();
    this.setupBridgeEvents();
  }

  private setupTelemetryEvents(): void {
    this.telemetryClient.on('connected', () => {
      console.error('[ETS2 MCP] Connected to telemetry server');
    });
    this.telemetryClient.on('disconnected', () => {
      console.error('[ETS2 MCP] Disconnected from telemetry server');
    });
    this.telemetryClient.on('error', (event) => {
      console.error('[ETS2 MCP] Telemetry error:', event.error);
    });
  }

  private setupBridgeEvents(): void {
    this.bridgeClient.on('connected', () => {
      console.error('[ETS2 MCP] Control bridge connected');
    });
    this.bridgeClient.on('disconnected', () => {
      console.error('[ETS2 MCP] Control bridge disconnected');
    });
    this.bridgeClient.on('scsConnected', () => {
      console.error('[ETS2 MCP] SCS plugin connected');
    });
    this.bridgeClient.on('scsDisconnected', () => {
      console.error('[ETS2 MCP] SCS plugin disconnected');
    });
    this.bridgeClient.on('error', (err) => {
      console.error('[ETS2 MCP] Bridge error:', err.message);
    });
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Connection management
        {
          name: 'ets2_connect',
          description: 'Connect to ETS2 telemetry server (HTTP)',
          inputSchema: {
            type: 'object',
            properties: {
              host: { type: 'string', description: 'Telemetry server host', default: this.config.host },
              port: { type: 'number', description: 'Telemetry server port', default: this.config.port },
              endpoint: { type: 'string', description: 'Telemetry API endpoint', default: this.config.endpoint },
            },
            required: [],
          },
        },
        {
          name: 'ets2_disconnect',
          description: 'Disconnect from ETS2 telemetry server',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_connection_status',
          description: 'Get connection status to telemetry server',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_bridge_connect',
          description: 'Connect to Control Bridge (named pipe) for vehicle control',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_bridge_status',
          description: 'Get control bridge connection status',
          inputSchema: { type: 'object', properties: {} },
        },

        // Data queries (read-only)
        {
          name: 'ets2_get_truck',
          description: 'Get current truck state (speed, RPM, gear, fuel, damage, etc.)',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_get_trailer',
          description: 'Get attached trailer info (cargo, mass, damage)',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_get_job',
          description: 'Get active job details (route, cargo, deadline, income)',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_get_navigation',
          description: 'Get GPS navigation info (next turn, distance, speed limit, ETA)',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_get_weather',
          description: 'Get current weather conditions',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_get_gps',
          description: 'Get GPS coordinates and heading',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_get_full_snapshot',
          description: 'Get complete telemetry snapshot (all data at once)',
          inputSchema: { type: 'object', properties: {} },
        },

        // Derived/calculated data
        {
          name: 'ets2_get_fuel_status',
          description: 'Get fuel level, range, consumption, and refuel recommendations',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_get_damage_report',
          description: 'Get damage status for truck and trailer',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_get_driving_status',
          description: 'Get driving status summary (speed, gear, lights, cruise control)',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_get_job_progress',
          description: 'Get job progress percentage, time remaining, distance to destination',
          inputSchema: { type: 'object', properties: {} },
        },

        // Control commands (write) - require bridge
        {
          name: 'ets2_set_throttle',
          description: 'Set throttle axis (0.0 - 1.0)',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'number', minimum: 0, maximum: 1, description: 'Throttle position' } },
            required: ['value'],
          },
        },
        {
          name: 'ets2_set_brake',
          description: 'Set brake axis (0.0 - 1.0)',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'number', minimum: 0, maximum: 1, description: 'Brake pressure' } },
            required: ['value'],
          },
        },
        {
          name: 'ets2_set_steering',
          description: 'Set steering axis (-1.0 left to 1.0 right)',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'number', minimum: -1, maximum: 1, description: 'Steering angle' } },
            required: ['value'],
          },
        },
        {
          name: 'ets2_set_clutch',
          description: 'Set clutch axis (0.0 - 1.0)',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'number', minimum: 0, maximum: 1, description: 'Clutch position' } },
            required: ['value'],
          },
        },
        {
          name: 'ets2_tap_key',
          description: 'Tap a keyboard key (for lights, gears, horns, menus)',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Key name (w, s, a, d, space, l, k, c, 1-9, r, etc.)' },
              duration: { type: 'number', description: 'Hold duration in ms', default: 50 },
            },
            required: ['key'],
          },
        },
        {
          name: 'ets2_set_gear',
          description: 'Shift to specific gear (-1=R, 0=N, 1-12)',
          inputSchema: {
            type: 'object',
            properties: { gear: { type: 'integer', minimum: -1, maximum: 12, description: 'Target gear' } },
            required: ['gear'],
          },
        },
        {
          name: 'ets2_toggle_light',
          description: 'Toggle a light (low, high, parking, beacon, hazard, left, right)',
          inputSchema: {
            type: 'object',
            properties: { light: { type: 'string', enum: ['low', 'high', 'parking', 'beacon', 'hazard', 'left', 'right'] } },
            required: ['light'],
          },
        },
        {
          name: 'ets2_toggle_cruise',
          description: 'Toggle cruise control on/off',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_set_cruise_speed',
          description: 'Set cruise control target speed (km/h)',
          inputSchema: {
            type: 'object',
            properties: { speed: { type: 'integer', minimum: 0, maximum: 150, description: 'Speed in km/h' } },
            required: ['speed'],
          },
        },
        {
          name: 'ets2_teleport',
          description: 'Teleport to coordinates or preset location (garage, service, ferry, dealer)',
          inputSchema: {
            type: 'object',
            oneOf: [
              { properties: { preset: { type: 'string', enum: ['garage', 'service', 'ferry', 'dealer'] } }, required: ['preset'] },
              { properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'y', 'z'] },
            ],
          },
        },
        {
          name: 'ets2_refuel',
          description: 'Refuel at gas station (simulates interaction)',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_repair',
          description: 'Repair truck at service (simulates interaction)',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_set_time_scale',
          description: 'Set game time scale (1.0 = normal, higher = faster)',
          inputSchema: {
            type: 'object',
            properties: { scale: { type: 'number', minimum: 0.1, maximum: 100, default: 1 } },
            required: ['scale'],
          },
        },

        // Driving helpers
        {
          name: 'ets2_drive_straight',
          description: 'Drive straight at target speed (sets throttle/brake to maintain speed)',
          inputSchema: {
            type: 'object',
            properties: { speedKmh: { type: 'number', description: 'Target speed in km/h' } },
            required: ['speedKmh'],
          },
        },
        {
          name: 'ets2_turn',
          description: 'Turn left or right (sets steering temporarily)',
          inputSchema: {
            type: 'object',
            properties: {
              direction: { type: 'string', enum: ['left', 'right'] },
              intensity: { type: 'number', minimum: 0.1, maximum: 1, default: 0.5 },
              duration: { type: 'number', description: 'Hold duration in ms', default: 1000 },
            },
            required: ['direction'],
          },
        },
        {
          name: 'ets2_stop',
          description: 'Emergency stop (full brake, zero throttle)',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_follow_navigation',
          description: 'Auto-follow GPS navigation (steers toward next waypoint)',
          inputSchema: { type: 'object', properties: {} },
        },

        // Utility
        {
          name: 'ets2_speed_kmh_to_mph',
          description: 'Convert km/h to mph',
          inputSchema: {
            type: 'object',
            properties: { kmh: { type: 'number', description: 'Speed in km/h' } },
            required: ['kmh'],
          },
        },
        {
          name: 'ets2_format_coordinates',
          description: 'Format GPS coordinates as DMS (degrees minutes seconds)',
          inputSchema: {
            type: 'object',
            properties: {
              lat: { type: 'number', description: 'Latitude' },
              lon: { type: 'number', description: 'Longitude' },
            },
            required: ['lat', 'lon'],
          },
        },

        // SCS Plugin Commands (Legal buy/customize/paint) - require SCS bridge
        {
          name: 'ets2_scs_connect',
          description: 'Connect to SCS plugin for legal truck buying/customization',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_scs_status',
          description: 'Get SCS plugin connection status',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_dealer_list',
          description: 'Get nearby dealers (brands, location, distance)',
          inputSchema: {
            type: 'object',
            properties: { maxDistanceKm: { type: 'number', default: 100, description: 'Search radius in km' } },
            required: [],
          },
        },
        {
          name: 'ets2_service_list',
          description: 'Get nearby service shops (customization/paint)',
          inputSchema: {
            type: 'object',
            properties: { maxDistanceKm: { type: 'number', default: 100, description: 'Search radius in km' } },
            required: [],
          },
        },
        {
          name: 'ets2_buy_truck',
          description: 'Buy a truck at current dealer (must be at dealer, needs money)',
          inputSchema: {
            type: 'object',
            properties: {
              makeId: { type: 'string', description: 'Brand: scania, volvo, man, daf, iveco, renault, mercedes' },
              modelId: { type: 'string', description: 'Model: scania_r_2016, volvo_fh16_2012, etc.' },
              engineId: { type: 'string', description: 'Engine: scania_dc16_730, volvo_d16k_750, etc.' },
              transmissionId: { type: 'string', description: 'Transmission: grso_12_speed, etc.' },
              chassisId: { type: 'string', description: 'Chassis: 6x4, 4x2, 8x4, etc.' },
              cabinId: { type: 'string', description: 'Cabin: scania_r_streamline, etc.' },
              paintId: { type: 'string', description: 'Base paint ID' },
              accessoryIds: { type: 'array', items: { type: 'string' }, description: 'Accessory IDs' },
            },
            required: ['makeId', 'modelId'],
          },
        },
        {
          name: 'ets2_sell_truck',
          description: 'Sell a truck from garage',
          inputSchema: {
            type: 'object',
            properties: { truckId: { type: 'string', description: 'Truck ID to sell' } },
            required: ['truckId'],
          },
        },
        {
          name: 'ets2_owned_trucks',
          description: 'List all owned trucks in garage',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_customize_truck',
          description: 'Customize current truck at service (engine, transmission, chassis, cabin, accessories)',
          inputSchema: {
            type: 'object',
            properties: {
              makeId: { type: 'string' },
              modelId: { type: 'string' },
              engineId: { type: 'string' },
              transmissionId: { type: 'string' },
              chassisId: { type: 'string' },
              cabinId: { type: 'string' },
              paintId: { type: 'string' },
              accessoryIds: { type: 'array', items: { type: 'string' } },
            },
            required: ['makeId', 'modelId'],
          },
        },
        {
          name: 'ets2_paint_truck',
          description: 'Paint current truck at service (color, metallic, gloss, decal)',
          inputSchema: {
            type: 'object',
            properties: {
              baseColor: { type: 'integer', description: 'RGB packed (0xRRGGBB)', minimum: 0, maximum: 0xFFFFFF },
              secondaryColor: { type: 'integer', description: 'Secondary RGB', minimum: 0, maximum: 0xFFFFFF },
              metallic: { type: 'number', description: 'Metallic 0.0-1.0', minimum: 0, maximum: 1 },
              gloss: { type: 'number', description: 'Gloss 0.0-1.0', minimum: 0, maximum: 1 },
              decalId: { type: 'string', description: 'Decal/skin ID' },
              decalColorId: { type: 'string', description: 'Decal color variant' },
            },
            required: ['baseColor'],
          },
        },
        {
          name: 'ets2_available_options',
          description: 'Get available customization options for current truck (engines, transmissions, chassis, cabins, paints, accessories)',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ets2_money',
          description: 'Get current money balance',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // Connection
          case 'ets2_connect':
            return await this.handleConnect(args as { host?: string; port?: number; endpoint?: string });
          case 'ets2_disconnect':
            return await this.handleDisconnect();
          case 'ets2_connection_status':
            return await this.handleConnectionStatus();
          case 'ets2_bridge_connect':
            return await this.handleBridgeConnect();
          case 'ets2_bridge_status':
            return await this.handleBridgeStatus();

          // Data queries
          case 'ets2_get_truck':
            return await this.handleGetTruck();
          case 'ets2_get_trailer':
            return await this.handleGetTrailer();
          case 'ets2_get_job':
            return await this.handleGetJob();
          case 'ets2_get_navigation':
            return await this.handleGetNavigation();
          case 'ets2_get_weather':
            return await this.handleGetWeather();
          case 'ets2_get_gps':
            return await this.handleGetGps();
          case 'ets2_get_full_snapshot':
            return await this.handleGetFullSnapshot();
          case 'ets2_get_fuel_status':
            return await this.handleGetFuelStatus();
          case 'ets2_get_damage_report':
            return await this.handleGetDamageReport();
          case 'ets2_get_driving_status':
            return await this.handleGetDrivingStatus();
          case 'ets2_get_job_progress':
            return await this.handleGetJobProgress();

          // Control commands
          case 'ets2_set_throttle':
            return await this.handleSetThrottle(args as { value: number });
          case 'ets2_set_brake':
            return await this.handleSetBrake(args as { value: number });
          case 'ets2_set_steering':
            return await this.handleSetSteering(args as { value: number });
          case 'ets2_set_clutch':
            return await this.handleSetClutch(args as { value: number });
          case 'ets2_tap_key':
            return await this.handleTapKey(args as { key: string; duration?: number });
          case 'ets2_set_gear':
            return await this.handleSetGear(args as { gear: number });
          case 'ets2_toggle_light':
            return await this.handleToggleLight(args as { light: string });
          case 'ets2_toggle_cruise':
            return await this.handleToggleCruise();
          case 'ets2_set_cruise_speed':
            return await this.handleSetCruiseSpeed(args as { speed: number });
          case 'ets2_teleport':
            return await this.handleTeleport(args as { preset?: string; x?: number; y?: number; z?: number });
          case 'ets2_refuel':
            return await this.handleRefuel();
          case 'ets2_repair':
            return await this.handleRepair();
          case 'ets2_set_time_scale':
            return await this.handleSetTimeScale(args as { scale: number });

          // Driving helpers
          case 'ets2_drive_straight':
            return await this.handleDriveStraight(args as { speedKmh: number });
          case 'ets2_turn':
            return await this.handleTurn(args as { direction: 'left' | 'right'; intensity?: number; duration?: number });
          case 'ets2_stop':
            return await this.handleStop();
          case 'ets2_follow_navigation':
            return await this.handleFollowNavigation();

          // Utility
          case 'ets2_speed_kmh_to_mph':
            return await this.handleSpeedConversion(args as { kmh: number });
          case 'ets2_format_coordinates':
            return await this.handleFormatCoordinates(args as { lat: number; lon: number });

          // SCS Plugin handlers
          case 'ets2_scs_connect':
            return await this.handleScsConnect();
          case 'ets2_scs_status':
            return await this.handleScsStatus();
          case 'ets2_dealer_list':
            return await this.handleDealerList(args as { maxDistanceKm?: number });
          case 'ets2_service_list':
            return await this.handleServiceList(args as { maxDistanceKm?: number });
          case 'ets2_buy_truck':
            return await this.handleBuyTruck(args as any);
          case 'ets2_sell_truck':
            return await this.handleSellTruck(args as { truckId: string });
          case 'ets2_owned_trucks':
            return await this.handleOwnedTrucks();
          case 'ets2_customize_truck':
            return await this.handleCustomizeTruck(args as any);
          case 'ets2_paint_truck':
            return await this.handlePaintTruck(args as any);
          case 'ets2_available_options':
            return await this.handleAvailableOptions();
          case 'ets2_money':
            return await this.handleMoney();
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : String(error));
      }
    });

    // Resources (unchanged)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        { uri: 'ets2://truck', name: 'Truck Telemetry', description: 'Real-time truck state data', mimeType: 'application/json' },
        { uri: 'ets2://trailer', name: 'Trailer Telemetry', description: 'Attached trailer data', mimeType: 'application/json' },
        { uri: 'ets2://job', name: 'Active Job', description: 'Current job information', mimeType: 'application/json' },
        { uri: 'ets2://navigation', name: 'Navigation', description: 'GPS navigation data', mimeType: 'application/json' },
        { uri: 'ets2://weather', name: 'Weather', description: 'Current weather conditions', mimeType: 'application/json' },
        { uri: 'ets2://snapshot', name: 'Full Snapshot', description: 'Complete telemetry snapshot', mimeType: 'application/json' },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      let data: any;
      switch (uri) {
        case 'ets2://truck': data = await this.telemetryClient.getTruckData(); break;
        case 'ets2://trailer': data = await this.telemetryClient.getTrailerData(); break;
        case 'ets2://job': data = await this.telemetryClient.getJobData(); break;
        case 'ets2://navigation': data = await this.telemetryClient.getNavigationData(); break;
        case 'ets2://weather': data = (await this.telemetryClient.getSnapshot())?.weather ?? null; break;
        case 'ets2://snapshot': data = await this.telemetryClient.getSnapshot(); break;
        default: throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
      }
      if (!data) throw new McpError(ErrorCode.InternalError, 'No telemetry data available. Connect to ETS2 first.');
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
    });
  }

  // ===== Connection Handlers =====
  private async handleConnect(args: { host?: string; port?: number; endpoint?: string }) {
    if (args.host) this.config.host = args.host;
    if (args.port) this.config.port = args.port;
    if (args.endpoint) this.config.endpoint = args.endpoint;
    this.telemetryClient.disconnect();
    await this.telemetryClient.connect();
    return { content: [{ type: 'text', text: `Connected to ETS2 telemetry at ${this.config.host}:${this.config.port}${this.config.endpoint}` }] };
  }

  private async handleDisconnect() {
    this.telemetryClient.disconnect();
    return { content: [{ type: 'text', text: 'Disconnected from ETS2 telemetry server' }] };
  }

  private async handleConnectionStatus() {
    return { content: [{ type: 'text', text: this.telemetryClient.isConnected ? 'Connected' : 'Disconnected' }] };
  }

  private async handleBridgeConnect() {
    try {
      await this.bridgeClient.connect();
      return { content: [{ type: 'text', text: 'Control bridge connected' }] };
    } catch (e) {
      throw new McpError(ErrorCode.InternalError, `Bridge connect failed: ${e instanceof Error ? e.message : String(e)}. Start ControlBridge.exe first.`);
    }
  }

  private async handleBridgeStatus() {
    return { content: [{ type: 'text', text: this.bridgeClient.isConnected ? 'Connected' : 'Disconnected' }] };
  }

  // ===== Data Query Handlers =====
  private async handleGetTruck() {
    const truck = await this.telemetryClient.getTruckData();
    if (!truck) throw new McpError(ErrorCode.InternalError, 'No truck data. Connect to ETS2 first.');
    return { content: [{ type: 'text', text: JSON.stringify(truck, null, 2) }] };
  }

  private async handleGetTrailer() {
    const trailer = await this.telemetryClient.getTrailerData();
    if (!trailer) throw new McpError(ErrorCode.InternalError, 'No trailer data. Connect to ETS2 first.');
    return { content: [{ type: 'text', text: JSON.stringify(trailer, null, 2) }] };
  }

  private async handleGetJob() {
    const job = await this.telemetryClient.getJobData();
    if (!job) throw new McpError(ErrorCode.InternalError, 'No job data. Connect to ETS2 first.');
    return { content: [{ type: 'text', text: JSON.stringify(job, null, 2) }] };
  }

  private async handleGetNavigation() {
    const nav = await this.telemetryClient.getNavigationData();
    if (!nav) throw new McpError(ErrorCode.InternalError, 'No navigation data. Connect to ETS2 first.');
    return { content: [{ type: 'text', text: JSON.stringify(nav, null, 2) }] };
  }

  private async handleGetWeather() {
    const snap = await this.telemetryClient.getSnapshot();
    if (!snap) throw new McpError(ErrorCode.InternalError, 'No weather data. Connect to ETS2 first.');
    return { content: [{ type: 'text', text: JSON.stringify(snap.weather, null, 2) }] };
  }

  private async handleGetGps() {
    const snap = await this.telemetryClient.getSnapshot();
    if (!snap) throw new McpError(ErrorCode.InternalError, 'No GPS data. Connect to ETS2 first.');
    return { content: [{ type: 'text', text: JSON.stringify(snap.gps, null, 2) }] };
  }

  private async handleGetFullSnapshot() {
    const snap = await this.telemetryClient.getSnapshot();
    if (!snap) throw new McpError(ErrorCode.InternalError, 'No telemetry data. Connect to ETS2 first.');
    return { content: [{ type: 'text', text: JSON.stringify(snap, null, 2) }] };
  }

  private async handleGetFuelStatus() {
    const truck = await this.telemetryClient.getTruckData();
    if (!truck) throw new McpError(ErrorCode.InternalError, 'No truck data. Connect to ETS2 first.');
    const fuelPercent = truck.fuelCapacity > 0 ? (truck.fuel / truck.fuelCapacity) * 100 : 0;
    const range = truck.fuelAverageConsumption > 0 ? (truck.fuel / truck.fuelAverageConsumption) * 100 : truck.fuelRange;
    const needsRefuel = fuelPercent < 20;
    return { content: [{ type: 'text', text: JSON.stringify({ current: truck.fuel, capacity: truck.fuelCapacity, percent: Math.round(fuelPercent * 10) / 10, averageConsumption: truck.fuelAverageConsumption, estimatedRange: Math.round(range), needsRefuel, recommendation: needsRefuel ? '⚠️ Fuel low - find a gas station soon!' : 'Fuel OK' }, null, 2) }] };
  }

  private async handleGetDamageReport() {
    const [truck, trailer] = await Promise.all([this.telemetryClient.getTruckData(), this.telemetryClient.getTrailerData()]);
    if (!truck) throw new McpError(ErrorCode.InternalError, 'No truck data. Connect to ETS2 first.');
    const truckDamage = { engine: Math.round(truck.engineDamage * 100), transmission: Math.round(truck.transmissionDamage * 100), cabin: Math.round(truck.cabinDamage * 100), chassis: Math.round(truck.chassisDamage * 100), wheels: Math.round(truck.wheelsDamage * 100), overall: Math.round((truck.engineDamage + truck.transmissionDamage + truck.cabinDamage + truck.chassisDamage + truck.wheelsDamage) / 5 * 100) };
    const trailerDamage = trailer?.attached ? { overall: Math.round(trailer.damage * 100), cargo: trailer.cargoName } : null;
    return { content: [{ type: 'text', text: JSON.stringify({ truck: truckDamage, trailer: trailerDamage }, null, 2) }] };
  }

  private async handleGetDrivingStatus() {
    const truck = await this.telemetryClient.getTruckData();
    if (!truck) throw new McpError(ErrorCode.InternalError, 'No truck data. Connect to ETS2 first.');
    return { content: [{ type: 'text', text: JSON.stringify({ speed: Math.round(truck.speedKmh), gear: truck.gear === -1 ? 'R' : truck.gear === 0 ? 'N' : truck.gear, rpm: Math.round(truck.engineRpm), rpmMax: truck.engineRpmMax, throttle: Math.round(truck.throttle * 100), brake: Math.round(truck.brake * 100), steering: Math.round(truck.steering * 100), cruiseControl: truck.cruiseControlEnabled ? `ON (${truck.cruiseControlSpeed} km/h)` : 'OFF', lights: { lowBeam: truck.lightsLowBeam, highBeam: truck.lightsHighBeam, parking: truck.lightsParking, beacon: truck.lightsBeacon, leftBlinker: truck.lightsLeftBlinker, rightBlinker: truck.lightsRightBlinker, hazard: truck.lightsHazard }, paused: (await this.telemetryClient.getSnapshot())?.paused ?? false }, null, 2) }] };
  }

  private async handleGetJobProgress() {
    const job = await this.telemetryClient.getJobData();
    if (!job || !job.active) return { content: [{ type: 'text', text: 'No active job' }] };
    const formatTime = (s: number) => s <= 0 ? 'OVERDUE' : `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
    return { content: [{ type: 'text', text: JSON.stringify({ jobId: job.jobId, route: `${job.sourceCity} (${job.sourceCompany}) → ${job.destinationCity} (${job.destinationCompany})`, cargo: `${job.cargoName} (${job.cargoMass} kg)`, distanceRemaining: job.distance, progress: job.distance > 0 ? `${job.distance.toFixed(1)} km remaining` : 'Arriving...', expectedIncome: job.income, deadline: job.deadline, timeRemaining: job.timeRemaining, timeRemainingFormatted: formatTime(job.timeRemaining), onTime: job.timeRemaining > 0 }, null, 2) }] };
  }

  // ===== Control Handlers =====
  private requireBridge() {
    if (!this.bridgeClient.isConnected) {
      throw new McpError(ErrorCode.InternalError, 'Control bridge not connected. Call ets2_bridge_connect first (requires ControlBridge.exe running).');
    }
  }

  private async handleSetThrottle(args: { value: number }) {
    this.requireBridge();
    await this.bridgeClient.setThrottle(Math.max(0, Math.min(1, args.value)));
    return { content: [{ type: 'text', text: `Throttle set to ${args.value}` }] };
  }

  private async handleSetBrake(args: { value: number }) {
    this.requireBridge();
    await this.bridgeClient.setBrake(Math.max(0, Math.min(1, args.value)));
    return { content: [{ type: 'text', text: `Brake set to ${args.value}` }] };
  }

  private async handleSetSteering(args: { value: number }) {
    this.requireBridge();
    await this.bridgeClient.setSteering(Math.max(-1, Math.min(1, args.value)));
    return { content: [{ type: 'text', text: `Steering set to ${args.value}` }] };
  }

  private async handleSetClutch(args: { value: number }) {
    this.requireBridge();
    await this.bridgeClient.setClutch(Math.max(0, Math.min(1, args.value)));
    return { content: [{ type: 'text', text: `Clutch set to ${args.value}` }] };
  }

  private async handleTapKey(args: { key: string; duration?: number }) {
    this.requireBridge();
    await this.bridgeClient.tapKey(args.key, args.duration ?? 50);
    return { content: [{ type: 'text', text: `Tapped key: ${args.key}` }] };
  }

  private async handleSetGear(args: { gear: number }) {
    this.requireBridge();
    await this.bridgeClient.setGear(args.gear);
    const label = args.gear === -1 ? 'R' : args.gear === 0 ? 'N' : args.gear.toString();
    return { content: [{ type: 'text', text: `Shifted to gear ${label}` }] };
  }

  private async handleToggleLight(args: { light: string }) {
    this.requireBridge();
    await this.bridgeClient.toggleLight(args.light);
    return { content: [{ type: 'text', text: `Toggled ${args.light} light` }] };
  }

  private async handleToggleCruise() {
    this.requireBridge();
    await this.bridgeClient.toggleCruise();
    return { content: [{ type: 'text', text: 'Toggled cruise control' }] };
  }

  private async handleSetCruiseSpeed(args: { speed: number }) {
    this.requireBridge();
    await this.bridgeClient.setCruiseSpeed(args.speed);
    return { content: [{ type: 'text', text: `Cruise speed set to ${args.speed} km/h` }] };
  }

  private async handleTeleport(args: { preset?: string; x?: number; y?: number; z?: number }) {
    this.requireBridge();
    if (args.preset) {
      await this.bridgeClient.teleport(args.preset);
      return { content: [{ type: 'text', text: `Teleported to ${args.preset}` }] };
    } else if (args.x !== undefined && args.y !== undefined && args.z !== undefined) {
      await this.bridgeClient.teleport({ x: args.x, y: args.y, z: args.z });
      return { content: [{ type: 'text', text: `Teleported to (${args.x}, ${args.y}, ${args.z})` }] };
    }
    throw new McpError(ErrorCode.InvalidRequest, 'Provide either preset or x,y,z coordinates');
  }

  private async handleRefuel() {
    this.requireBridge();
    await this.bridgeClient.refuel();
    return { content: [{ type: 'text', text: 'Refuel sequence initiated' }] };
  }

  private async handleRepair() {
    this.requireBridge();
    await this.bridgeClient.repair();
    return { content: [{ type: 'text', text: 'Repair sequence initiated' }] };
  }

  private async handleSetTimeScale(args: { scale: number }) {
    this.requireBridge();
    await this.bridgeClient.setTimeScale(args.scale);
    return { content: [{ type: 'text', text: `Time scale set to ${args.scale}x` }] };
  }

  // ===== Driving Helpers =====
  private async handleDriveStraight(args: { speedKmh: number }) {
    this.requireBridge();
    const truck = await this.telemetryClient.getTruckData();
    if (!truck) throw new McpError(ErrorCode.InternalError, 'No truck data');

    const target = args.speedKmh;
    const current = truck.speedKmh;
    const diff = target - current;

    if (diff > 2) {
      await this.bridgeClient.setThrottle(0.7);
      await this.bridgeClient.setBrake(0);
    } else if (diff < -2) {
      await this.bridgeClient.setThrottle(0);
      await this.bridgeClient.setBrake(0.5);
    } else {
      await this.bridgeClient.setThrottle(0.3);
      await this.bridgeClient.setBrake(0);
    }
    await this.bridgeClient.setSteering(0);

    return { content: [{ type: 'text', text: `Driving straight at ${target} km/h (current: ${Math.round(current)} km/h)` }] };
  }

  private async handleTurn(args: { direction: 'left' | 'right'; intensity?: number; duration?: number }) {
    this.requireBridge();
    const value = args.direction === 'left' ? -Math.abs(args.intensity ?? 0.5) : Math.abs(args.intensity ?? 0.5);
    await this.bridgeClient.setSteering(value);
    await new Promise(r => setTimeout(r, args.duration ?? 1000));
    await this.bridgeClient.setSteering(0);
    return { content: [{ type: 'text', text: `Turned ${args.direction} (steering: ${value.toFixed(2)})` }] };
  }

  private async handleStop() {
    this.requireBridge();
    await this.bridgeClient.setThrottle(0);
    await this.bridgeClient.setBrake(1);
    await this.bridgeClient.setSteering(0);
    return { content: [{ type: 'text', text: '🛑 Emergency stop applied (full brake, zero throttle)' }] };
  }

  private async handleFollowNavigation() {
    this.requireBridge();
    const nav = await this.telemetryClient.getNavigationData();
    if (!nav || !nav.active) {
      return { content: [{ type: 'text', text: 'No active navigation route' }] };
    }
    // 简化：根据下一转向方向设置转向
    let steering = 0;
    switch (nav.nextDirection) {
      case 'left': case 'sharp_left': steering = -0.6; break;
      case 'right': case 'sharp_right': steering = 0.6; break;
      case 'uturn': steering = -0.8; break;
      default: steering = 0;
    }
    await this.bridgeClient.setSteering(steering);
    return { content: [{ type: 'text', text: `Following navigation: ${nav.nextDirection} in ${nav.distanceToNext}m (steering: ${steering})` }] };
  }

  // ===== Utility =====
  private async handleSpeedConversion(args: { kmh: number }) {
    return { content: [{ type: 'text', text: `${args.kmh} km/h = ${(args.kmh * 0.621371).toFixed(1)} mph` }] };
  }

  private async handleFormatCoordinates(args: { lat: number; lon: number }) {
    const toDMS = (deg: number, isLat: boolean) => {
      const dir = deg >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W');
      const abs = Math.abs(deg);
      const d = Math.floor(abs);
      const m = Math.floor((abs - d) * 60);
      const s = ((abs - d - m / 60) * 3600).toFixed(2);
      return `${d}°${m}'${s}"${dir}`;
    };
    return { content: [{ type: 'text', text: `Lat: ${toDMS(args.lat, true)}\nLon: ${toDMS(args.lon, false)}` }] };
  }

  // ===== SCS Plugin Handlers =====
  private requireScsBridge() {
    if (!this.bridgeClient.isScsConnected) {
      throw new McpError(ErrorCode.InternalError, 'SCS plugin not connected. Call ets2_scs_connect first (requires ets2_mcp_plugin.dll loaded in game).');
    }
  }

  private async handleScsConnect() {
    try {
      await this.bridgeClient.connectScs();
      return { content: [{ type: 'text', text: 'SCS plugin connected' }] };
    } catch (e) {
      throw new McpError(ErrorCode.InternalError, `SCS connect failed: ${e instanceof Error ? e.message : String(e)}. Ensure ets2_mcp_plugin.dll is in ETS2 plugins folder and game is running.`);
    }
  }

  private async handleScsStatus() {
    return { content: [{ type: 'text', text: this.bridgeClient.isScsConnected ? 'Connected' : 'Disconnected' }] };
  }

  private async handleDealerList(args: { maxDistanceKm?: number }) {
    this.requireScsBridge();
    const dealers = await this.bridgeClient.scsGetDealers(args.maxDistanceKm ?? 100);
    return { content: [{ type: 'text', text: JSON.stringify(dealers, null, 2) }] };
  }

  private async handleServiceList(args: { maxDistanceKm?: number }) {
    this.requireScsBridge();
    const services = await this.bridgeClient.scsGetServices(args.maxDistanceKm ?? 100);
    return { content: [{ type: 'text', text: JSON.stringify(services, null, 2) }] };
  }

  private async handleBuyTruck(args: any) {
    this.requireScsBridge();
    const result = await this.bridgeClient.scsBuyTruck(args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  private async handleSellTruck(args: { truckId: string }) {
    this.requireScsBridge();
    const result = await this.bridgeClient.scsSellTruck(args.truckId);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  private async handleOwnedTrucks() {
    this.requireScsBridge();
    const trucks = await this.bridgeClient.scsGetOwnedTrucks();
    return { content: [{ type: 'text', text: JSON.stringify(trucks, null, 2) }] };
  }

  private async handleCustomizeTruck(args: any) {
    this.requireScsBridge();
    const result = await this.bridgeClient.scsCustomizeTruck(args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  private async handlePaintTruck(args: any) {
    this.requireScsBridge();
    const result = await this.bridgeClient.scsPaintTruck(args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  private async handleAvailableOptions() {
    this.requireScsBridge();
    const options = await this.bridgeClient.scsGetAvailableOptions();
    return { content: [{ type: 'text', text: JSON.stringify(options, null, 2) }] };
  }

  private async handleMoney() {
    this.requireScsBridge();
    const money = await this.bridgeClient.scsGetMoney();
    return { content: [{ type: 'text', text: JSON.stringify(money, null, 2) }] };
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[ETS2 MCP] Server started on stdio');
  }

  async stop(): Promise<void> {
    this.telemetryClient.disconnect();
    this.bridgeClient.disconnect();
    await this.server.close();
  }
}