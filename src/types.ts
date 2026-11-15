/**
 * ETS2 Telemetry Data Types
 * Based on Funbit ETS2 Telemetry Server and SCS SDK structures
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Rotation {
  x: number; // pitch
  y: number; // yaw
  z: number; // roll
}

export interface TruckData {
  // Basic info
  truckId: string;
  truckMake: string;
  truckModel: string;
  
  // Physics state
  speed: number;           // m/s
  speedKmh: number;        // km/h
  acceleration: Vector3;
  angularVelocity: Vector3;
  
  // Engine
  engineRpm: number;
  engineRpmMax: number;
  gear: number;            // current gear (0 = neutral, -1 = reverse)
  gearCount: number;       // total forward gears
  
  // Controls
  throttle: number;        // 0.0 - 1.0
  brake: number;           // 0.0 - 1.0
  clutch: number;          // 0.0 - 1.0
  steering: number;        // -1.0 - 1.0
  
  // Lights
  lightsLowBeam: boolean;
  lightsHighBeam: boolean;
  lightsParking: boolean;
  lightsBeacon: boolean;
  lightsBrake: boolean;
  lightsReverse: boolean;
  lightsLeftBlinker: boolean;
  lightsRightBlinker: boolean;
  lightsHazard: boolean;
  
  // Dashboard
  fuel: number;            // current fuel (liters)
  fuelCapacity: number;    // tank capacity (liters)
  fuelAverageConsumption: number; // L/100km
  fuelRange: number;       // estimated range (km)
  oilPressure: number;     // kPa
  oilTemperature: number;  // Celsius
  waterTemperature: number; // Celsius
  batteryVoltage: number;  // Volts
  
  // Damage
  engineDamage: number;    // 0.0 - 1.0
  transmissionDamage: number;
  cabinDamage: number;
  chassisDamage: number;
  wheelsDamage: number;    // average
  
  // Cruise control
  cruiseControlEnabled: boolean;
  cruiseControlSpeed: number; // km/h
  
  // Position & orientation
  position: Vector3;       // world coordinates
  rotation: Rotation;      // Euler angles
  
  // Odometer
  odometer: number;        // km
  
  // Time
  gameTime: number;        // seconds since game start
  timeScale: number;       // time acceleration factor
}

export interface TrailerData {
  attached: boolean;
  trailerId: string;
  trailerName: string;
  mass: number;            // kg
  cargoMass: number;       // kg
  cargoCapacity: number;   // kg
  cargoName: string;
  damage: number;          // 0.0 - 1.0
  position: Vector3;
  rotation: Rotation;
  wheelsOnGround: number;  // count
}

export interface JobData {
  active: boolean;
  jobId: string;
  sourceCity: string;
  sourceCompany: string;
  destinationCity: string;
  destinationCompany: string;
  cargoName: string;
  cargoMass: number;       // kg
  distance: number;        // km remaining
  income: number;          // expected income
  deadline: number;        // game time seconds
  timeRemaining: number;   // seconds
}

export interface NavigationData {
  active: boolean;
  nextDirection: string;   // "straight", "left", "right", "sharp_left", "sharp_right", "uturn"
  distanceToNext: number;  // meters
  nextRoadNumber: string;
  nextRoadName: string;
  speedLimit: number;      // km/h
  estimatedArrival: number; // game time seconds
}

export interface WeatherData {
  rain: number;            // 0.0 - 1.0
  thunder: number;         // 0.0 - 1.0
  fog: number;             // 0.0 - 1.0
  wind: Vector3;
  cloudiness: number;      // 0.0 - 1.0
  temperature: number;     // Celsius
}

export interface GpsData {
  latitude: number;
  longitude: number;
  altitude: number;
  heading: number;         // degrees
}

export interface TelemetrySnapshot {
  timestamp: number;       // Unix ms
  truck: TruckData;
  trailer: TrailerData;
  job: JobData;
  navigation: NavigationData;
  weather: WeatherData;
  gps: GpsData;
  paused: boolean;
  inMenu: boolean;
}

export interface TelemetryConfig {
  host: string;
  port: number;
  endpoint: string;
  updateInterval: number;  // ms
  timeout: number;         // ms
}

export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  host: '127.0.0.1',
  port: 25555,
  endpoint: '/api/telemetry',
  updateInterval: 100,
  timeout: 5000,
};

export type TelemetryEventType = 
  | 'truckUpdate'
  | 'trailerUpdate'
  | 'jobUpdate'
  | 'navigationUpdate'
  | 'weatherUpdate'
  | 'pauseChange'
  | 'menuChange'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface TelemetryEvent {
  type: TelemetryEventType;
  data: any;
  timestamp: number;
}