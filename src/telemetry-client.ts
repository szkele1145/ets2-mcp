/**
 * ETS2 Telemetry Client
 * Connects to Funbit ETS2 Telemetry Server or compatible HTTP endpoints
 */

import { EventEmitter } from 'events';
import {
  TelemetryConfig,
  TelemetrySnapshot,
  TelemetryEvent,
  TelemetryEventType,
  DEFAULT_TELEMETRY_CONFIG,
  TruckData,
  TrailerData,
  JobData,
  NavigationData,
  WeatherData,
  GpsData,
} from './types.js';

export class TelemetryClient extends EventEmitter {
  private config: TelemetryConfig;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private lastSnapshot: TelemetrySnapshot | null = null;
  private connected = false;
  private baseUrl: string;

  constructor(config: Partial<TelemetryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_TELEMETRY_CONFIG, ...config };
    this.baseUrl = `http://${this.config.host}:${this.config.port}`;
  }

  get url(): string {
    return `${this.baseUrl}${this.config.endpoint}`;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get latestSnapshot(): TelemetrySnapshot | null {
    return this.lastSnapshot;
  }

  async connect(): Promise<void> {
    try {
      const response = await this.fetchWithTimeout(this.url);
      if (response.ok) {
        this.connected = true;
        this.emit('connected', { timestamp: Date.now() });
        this.startPolling();
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.connected = false;
      this.emit('error', { error: error instanceof Error ? error.message : String(error), timestamp: Date.now() });
      throw error;
    }
  }

  disconnect(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.connected) {
      this.connected = false;
      this.emit('disconnected', { timestamp: Date.now() });
    }
  }

  private startPolling(): void {
    this.pollingInterval = setInterval(async () => {
      await this.pollOnce();
    }, this.config.updateInterval);
  }

  private async pollOnce(): Promise<void> {
    try {
      const snapshot = await this.fetchSnapshot();
      this.processSnapshot(snapshot);
    } catch (error) {
      if (this.connected) {
        this.connected = false;
        this.emit('disconnected', { timestamp: Date.now() });
      }
      this.emit('error', { error: error instanceof Error ? error.message : String(error), timestamp: Date.now() });
    }
  }

  private async fetchSnapshot(): Promise<TelemetrySnapshot> {
    const response = await this.fetchWithTimeout(this.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return this.normalizeSnapshot(data);
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private normalizeSnapshot(raw: any): TelemetrySnapshot {
    return {
      timestamp: Date.now(),
      truck: this.normalizeTruck(raw.truck),
      trailer: this.normalizeTrailer(raw.trailer),
      job: this.normalizeJob(raw.job),
      navigation: this.normalizeNavigation(raw.navigation),
      weather: this.normalizeWeather(raw.weather),
      gps: this.normalizeGps(raw.gps),
      paused: raw.paused ?? false,
      inMenu: raw.inMenu ?? false,
    };
  }

  private normalizeTruck(raw: any): TruckData {
    const speed = raw.speed ?? 0;
    return {
      truckId: raw.truckId ?? '',
      truckMake: raw.truckMake ?? '',
      truckModel: raw.truckModel ?? '',
      speed,
      speedKmh: speed * 3.6,
      acceleration: raw.acceleration ?? { x: 0, y: 0, z: 0 },
      angularVelocity: raw.angularVelocity ?? { x: 0, y: 0, z: 0 },
      engineRpm: raw.engineRpm ?? 0,
      engineRpmMax: raw.engineRpmMax ?? 2500,
      gear: raw.gear ?? 0,
      gearCount: raw.gearCount ?? 12,
      throttle: raw.throttle ?? 0,
      brake: raw.brake ?? 0,
      clutch: raw.clutch ?? 0,
      steering: raw.steering ?? 0,
      lightsLowBeam: raw.lightsLowBeam ?? false,
      lightsHighBeam: raw.lightsHighBeam ?? false,
      lightsParking: raw.lightsParking ?? false,
      lightsBeacon: raw.lightsBeacon ?? false,
      lightsBrake: raw.lightsBrake ?? false,
      lightsReverse: raw.lightsReverse ?? false,
      lightsLeftBlinker: raw.lightsLeftBlinker ?? false,
      lightsRightBlinker: raw.lightsRightBlinker ?? false,
      lightsHazard: raw.lightsHazard ?? false,
      fuel: raw.fuel ?? 0,
      fuelCapacity: raw.fuelCapacity ?? 0,
      fuelAverageConsumption: raw.fuelAverageConsumption ?? 0,
      fuelRange: raw.fuelRange ?? 0,
      oilPressure: raw.oilPressure ?? 0,
      oilTemperature: raw.oilTemperature ?? 0,
      waterTemperature: raw.waterTemperature ?? 0,
      batteryVoltage: raw.batteryVoltage ?? 0,
      engineDamage: raw.engineDamage ?? 0,
      transmissionDamage: raw.transmissionDamage ?? 0,
      cabinDamage: raw.cabinDamage ?? 0,
      chassisDamage: raw.chassisDamage ?? 0,
      wheelsDamage: raw.wheelsDamage ?? 0,
      cruiseControlEnabled: raw.cruiseControlEnabled ?? false,
      cruiseControlSpeed: raw.cruiseControlSpeed ?? 0,
      position: raw.position ?? { x: 0, y: 0, z: 0 },
      rotation: raw.rotation ?? { x: 0, y: 0, z: 0 },
      odometer: raw.odometer ?? 0,
      gameTime: raw.gameTime ?? 0,
      timeScale: raw.timeScale ?? 1,
    };
  }

  private normalizeTrailer(raw: any): TrailerData {
    return {
      attached: raw?.attached ?? false,
      trailerId: raw?.trailerId ?? '',
      trailerName: raw?.trailerName ?? '',
      mass: raw?.mass ?? 0,
      cargoMass: raw?.cargoMass ?? 0,
      cargoCapacity: raw?.cargoCapacity ?? 0,
      cargoName: raw?.cargoName ?? '',
      damage: raw?.damage ?? 0,
      position: raw?.position ?? { x: 0, y: 0, z: 0 },
      rotation: raw?.rotation ?? { x: 0, y: 0, z: 0 },
      wheelsOnGround: raw?.wheelsOnGround ?? 0,
    };
  }

  private normalizeJob(raw: any): JobData {
    return {
      active: raw?.active ?? false,
      jobId: raw?.jobId ?? '',
      sourceCity: raw?.sourceCity ?? '',
      sourceCompany: raw?.sourceCompany ?? '',
      destinationCity: raw?.destinationCity ?? '',
      destinationCompany: raw?.destinationCompany ?? '',
      cargoName: raw?.cargoName ?? '',
      cargoMass: raw?.cargoMass ?? 0,
      distance: raw?.distance ?? 0,
      income: raw?.income ?? 0,
      deadline: raw?.deadline ?? 0,
      timeRemaining: raw?.timeRemaining ?? 0,
    };
  }

  private normalizeNavigation(raw: any): NavigationData {
    return {
      active: raw?.active ?? false,
      nextDirection: raw?.nextDirection ?? 'straight',
      distanceToNext: raw?.distanceToNext ?? 0,
      nextRoadNumber: raw?.nextRoadNumber ?? '',
      nextRoadName: raw?.nextRoadName ?? '',
      speedLimit: raw?.speedLimit ?? 0,
      estimatedArrival: raw?.estimatedArrival ?? 0,
    };
  }

  private normalizeWeather(raw: any): WeatherData {
    return {
      rain: raw?.rain ?? 0,
      thunder: raw?.thunder ?? 0,
      fog: raw?.fog ?? 0,
      wind: raw?.wind ?? { x: 0, y: 0, z: 0 },
      cloudiness: raw?.cloudiness ?? 0,
      temperature: raw?.temperature ?? 20,
    };
  }

  private normalizeGps(raw: any): GpsData {
    return {
      latitude: raw?.latitude ?? 0,
      longitude: raw?.longitude ?? 0,
      altitude: raw?.altitude ?? 0,
      heading: raw?.heading ?? 0,
    };
  }

  private processSnapshot(snapshot: TelemetrySnapshot): void {
    const prev = this.lastSnapshot;
    this.lastSnapshot = snapshot;

    // Emit full snapshot
    this.emit('snapshot', snapshot);

    // Emit granular updates for changes
    if (!prev || this.hasChanged(prev.truck, snapshot.truck)) {
      this.emit('truckUpdate', snapshot.truck);
    }
    if (!prev || this.hasChanged(prev.trailer, snapshot.trailer)) {
      this.emit('trailerUpdate', snapshot.trailer);
    }
    if (!prev || this.hasChanged(prev.job, snapshot.job)) {
      this.emit('jobUpdate', snapshot.job);
    }
    if (!prev || this.hasChanged(prev.navigation, snapshot.navigation)) {
      this.emit('navigationUpdate', snapshot.navigation);
    }
    if (!prev || this.hasChanged(prev.weather, snapshot.weather)) {
      this.emit('weatherUpdate', snapshot.weather);
    }
    if (!prev || prev.paused !== snapshot.paused) {
      this.emit('pauseChange', snapshot.paused);
    }
    if (!prev || prev.inMenu !== snapshot.inMenu) {
      this.emit('menuChange', snapshot.inMenu);
    }
  }

  private hasChanged(prev: any, curr: any): boolean {
    return JSON.stringify(prev) !== JSON.stringify(curr);
  }

  async getSnapshot(): Promise<TelemetrySnapshot | null> {
    if (this.lastSnapshot) return this.lastSnapshot;
    try {
      const snapshot = await this.fetchSnapshot();
      this.processSnapshot(snapshot);
      return snapshot;
    } catch {
      return null;
    }
  }

  async getTruckData(): Promise<TruckData | null> {
    const snap = await this.getSnapshot();
    return snap?.truck ?? null;
  }

  async getTrailerData(): Promise<TrailerData | null> {
    const snap = await this.getSnapshot();
    return snap?.trailer ?? null;
  }

  async getJobData(): Promise<JobData | null> {
    const snap = await this.getSnapshot();
    return snap?.job ?? null;
  }

  async getNavigationData(): Promise<NavigationData | null> {
    const snap = await this.getSnapshot();
    return snap?.navigation ?? null;
  }
}