/**
 * Control Bridge Client
 * Communicates with C# ControlBridge.exe via Named Pipe (basic control + SCS plugin)
 */

import { EventEmitter } from 'events';

export interface BridgeCommand {
  command: string;
  payload?: any;
}

export interface BridgeResponse {
  requestId: string;
  success: boolean;
  error?: string;
  data?: any;
}

interface PipeConnection {
  pipePath: string;
  connected: boolean;
  requestId: number;
  pending: Map<string, (resp: BridgeResponse) => void>;
  pipeHandle?: any;
  writer?: (msg: string) => void;
}

export class BridgeClient extends EventEmitter {
  // Basic control pipe (SendInput driving)
  private basicPipe: PipeConnection = {
    pipePath: '\\\\.\\pipe\\ets2mcp',
    connected: false,
    requestId: 0,
    pending: new Map(),
  };

  // SCS plugin pipe (legal buy/customize/paint)
  private scsPipe: PipeConnection = {
    pipePath: '\\\\.\\pipe\\ets2mcp_scs',
    connected: false,
    requestId: 0,
    pending: new Map(),
  };

  async connect(): Promise<void> {
    await this.connectPipe(this.basicPipe);
  }

  async connectScs(): Promise<void> {
    await this.connectPipe(this.scsPipe);
  }

  private async connectPipe(pipe: PipeConnection): Promise<void> {
    if (pipe.connected) return;

    const net = await import('net');
    
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(pipe.pipePath, () => {
        pipe.connected = true;
        console.error(`[BridgeClient] Connected to ${pipe.pipePath}`);
        this.emit(pipe.pipePath === this.basicPipe.pipePath ? 'connected' : 'scsConnected');
        resolve();
      });

      socket.on('data', (data: Buffer) => {
        this.handleData(pipe, data.toString());
      });

      socket.on('close', () => {
        pipe.connected = false;
        console.error(`[BridgeClient] Disconnected from ${pipe.pipePath}`);
        this.emit(pipe.pipePath === this.basicPipe.pipePath ? 'disconnected' : 'scsDisconnected');
      });

      socket.on('error', (err: Error) => {
        if (!pipe.connected) {
          reject(err);
        } else {
          this.emit('error', err);
        }
      });

      pipe.pipeHandle = socket;
      pipe.writer = (msg: string) => socket.write(msg + '\n');
    });
  }

  private handleData(pipe: PipeConnection, data: string): void {
    const lines = data.trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const resp: BridgeResponse = JSON.parse(line);
        const resolver = pipe.pending.get(resp.requestId);
        if (resolver) {
          pipe.pending.delete(resp.requestId);
          resolver(resp);
        }
      } catch (e) {
        console.error('[BridgeClient] Parse error:', e, line);
      }
    }
  }

  private async sendCommand(pipe: PipeConnection, command: string, payload?: any): Promise<any> {
    if (!pipe.connected) {
      const pipeName = pipe.pipePath === this.basicPipe.pipePath ? 'basic control' : 'SCS plugin';
      throw new Error(`${pipeName} bridge not connected. Start ControlBridge.exe first.`);
    }

    const requestId = `req_${++pipe.requestId}_${Date.now()}`;
    const msg = JSON.stringify({ Command: command, Payload: payload, RequestId: requestId });

    return new Promise((resolve, reject) => {
      pipe.pending.set(requestId, (resp) => {
        if (resp.success) {
          resolve(resp.data);
        } else {
          reject(new Error(resp.error || 'Unknown bridge error'));
        }
      });

      pipe.writer!(msg);

      // 15秒超时 for SCS commands
      setTimeout(() => {
        if (pipe.pending.has(requestId)) {
          pipe.pending.delete(requestId);
          reject(new Error('Bridge command timeout'));
        }
      }, 15000);
    });
  }

  // ===== Basic Control Commands (SendInput) =====
  async setThrottle(value: number) {
    return this.sendCommand(this.basicPipe, 'SetThrottle', { value });
  }

  async setBrake(value: number) {
    return this.sendCommand(this.basicPipe, 'SetBrake', { value });
  }

  async setSteering(value: number) {
    return this.sendCommand(this.basicPipe, 'SetSteering', { value });
  }

  async setClutch(value: number) {
    return this.sendCommand(this.basicPipe, 'SetClutch', { value });
  }

  async pressKey(key: string) {
    return this.sendCommand(this.basicPipe, 'PressKey', { key });
  }

  async releaseKey(key: string) {
    return this.sendCommand(this.basicPipe, 'ReleaseKey', { key });
  }

  async tapKey(key: string, duration = 50) {
    return this.sendCommand(this.basicPipe, 'TapKey', { key, duration });
  }

  async setGear(gear: number) {
    return this.sendCommand(this.basicPipe, 'SetGear', { gear });
  }

  async toggleLight(light: string) {
    return this.sendCommand(this.basicPipe, 'ToggleLight', { light });
  }

  async toggleCruise() {
    return this.sendCommand(this.basicPipe, 'ToggleCruise', {});
  }

  async setCruiseSpeed(speed: number) {
    return this.sendCommand(this.basicPipe, 'SetCruiseSpeed', { speed });
  }

  async teleport(target: { x: number; y: number; z: number } | string) {
    return this.sendCommand(this.basicPipe, 'Teleport', target);
  }

  async refuel() {
    return this.sendCommand(this.basicPipe, 'Refuel', {});
  }

  async repair() {
    return this.sendCommand(this.basicPipe, 'Repair', {});
  }

  async setTimeScale(scale: number) {
    return this.sendCommand(this.basicPipe, 'SetTimeScale', { scale });
  }

  async getStatus() {
    return this.sendCommand(this.basicPipe, 'GetStatus', {});
  }

  // ===== SCS Plugin Commands (Legal buy/customize/paint) =====
  async scsGetTelemetry() {
    return this.sendCommand(this.scsPipe, 'GetTelemetry', {});
  }

  async scsGetDealers(maxDistanceKm = 100) {
    return this.sendCommand(this.scsPipe, 'GetDealers', { maxDistanceKm });
  }

  async scsGetServices(maxDistanceKm = 100) {
    return this.sendCommand(this.scsPipe, 'GetServices', { maxDistanceKm });
  }

  async scsBuyTruck(spec: {
    makeId: string;
    modelId: string;
    engineId?: string;
    transmissionId?: string;
    chassisId?: string;
    cabinId?: string;
    paintId?: string;
    accessoryIds?: string[];
  }) {
    return this.sendCommand(this.scsPipe, 'BuyTruck', spec);
  }

  async scsSellTruck(truckId: string) {
    return this.sendCommand(this.scsPipe, 'SellTruck', { truckId });
  }

  async scsGetOwnedTrucks() {
    return this.sendCommand(this.scsPipe, 'GetOwnedTrucks', {});
  }

  async scsCustomizeTruck(spec: {
    makeId: string;
    modelId: string;
    engineId?: string;
    transmissionId?: string;
    chassisId?: string;
    cabinId?: string;
    paintId?: string;
    accessoryIds?: string[];
  }) {
    return this.sendCommand(this.scsPipe, 'CustomizeTruck', spec);
  }

  async scsPaintTruck(paint: {
    baseColor: number;      // RGB packed (0xRRGGBB)
    secondaryColor?: number;
    metallic?: number;      // 0.0-1.0
    gloss?: number;         // 0.0-1.0
    decalId?: string;
    decalColorId?: string;
  }) {
    return this.sendCommand(this.scsPipe, 'PaintTruck', paint);
  }

  async scsGetAvailableOptions() {
    return this.sendCommand(this.scsPipe, 'GetAvailableOptions', {});
  }

  async scsGetMoney() {
    return this.sendCommand(this.scsPipe, 'GetMoney', {});
  }

  async scsGetStatus() {
    return this.sendCommand(this.scsPipe, 'GetStatus', {});
  }

  disconnect(): void {
    for (const pipe of [this.basicPipe, this.scsPipe]) {
      if (pipe.pipeHandle) {
        pipe.pipeHandle.destroy();
        pipe.pipeHandle = undefined;
      }
      pipe.connected = false;
    }
  }

  get isConnected(): boolean {
    return this.basicPipe.connected;
  }

  get isScsConnected(): boolean {
    return this.scsPipe.connected;
  }
}