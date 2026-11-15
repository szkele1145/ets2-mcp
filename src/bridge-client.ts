/**
 * Control Bridge Client
 * Communicates with C# ControlBridge.exe via Named Pipe
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

export class BridgeClient extends EventEmitter {
  private pipePath = '\\\\.\\pipe\\ets2mcp';
  private connected = false;
  private requestId = 0;
  private pending = new Map<string, (resp: BridgeResponse) => void>();
  private reader?: any;
  private writer?: any;
  private pipeHandle?: any;

  async connect(): Promise<void> {
    if (this.connected) return;

    // Windows named pipe via net module
    const net = await import('net');
    
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.pipePath, () => {
        this.connected = true;
        console.error('[BridgeClient] Connected to Control Bridge');
        this.emit('connected');
        resolve();
      });

      socket.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      socket.on('close', () => {
        this.connected = false;
        console.error('[BridgeClient] Disconnected from Control Bridge');
        this.emit('disconnected');
      });

      socket.on('error', (err: Error) => {
        if (!this.connected) {
          reject(err);
        } else {
          this.emit('error', err);
        }
      });

      this.pipeHandle = socket;
      this.writer = (msg: string) => socket.write(msg + '\n');
    });
  }

  private handleData(data: string): void {
    const lines = data.trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const resp: BridgeResponse = JSON.parse(line);
        const resolver = this.pending.get(resp.requestId);
        if (resolver) {
          this.pending.delete(resp.requestId);
          resolver(resp);
        }
      } catch (e) {
        console.error('[BridgeClient] Parse error:', e, line);
      }
    }
  }

  async sendCommand(command: string, payload?: any): Promise<any> {
    if (!this.connected) {
      throw new Error('Bridge not connected. Start ControlBridge.exe first.');
    }

    const requestId = `req_${++this.requestId}_${Date.now()}`;
    const msg = JSON.stringify({ Command: command, Payload: payload, RequestId: requestId });

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, (resp) => {
        if (resp.success) {
          resolve(resp.data);
        } else {
          reject(new Error(resp.error || 'Unknown bridge error'));
        }
      });

      this.writer!(msg);

      // 10秒超时
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error('Bridge command timeout'));
        }
      }, 10000);
    });
  }

  // 便捷方法
  async setThrottle(value: number) {
    return this.sendCommand('SetThrottle', { value });
  }

  async setBrake(value: number) {
    return this.sendCommand('SetBrake', { value });
  }

  async setSteering(value: number) {
    return this.sendCommand('SetSteering', { value });
  }

  async setClutch(value: number) {
    return this.sendCommand('SetClutch', { value });
  }

  async pressKey(key: string) {
    return this.sendCommand('PressKey', { key });
  }

  async releaseKey(key: string) {
    return this.sendCommand('ReleaseKey', { key });
  }

  async tapKey(key: string, duration = 50) {
    return this.sendCommand('TapKey', { key, duration });
  }

  async setGear(gear: number) {
    return this.sendCommand('SetGear', { gear });
  }

  async toggleLight(light: string) {
    return this.sendCommand('ToggleLight', { light });
  }

  async toggleCruise() {
    return this.sendCommand('ToggleCruise', {});
  }

  async setCruiseSpeed(speed: number) {
    return this.sendCommand('SetCruiseSpeed', { speed });
  }

  async teleport(target: { x: number; y: number; z: number } | string) {
    return this.sendCommand('Teleport', target);
  }

  async refuel() {
    return this.sendCommand('Refuel', {});
  }

  async repair() {
    return this.sendCommand('Repair', {});
  }

  async setTimeScale(scale: number) {
    return this.sendCommand('SetTimeScale', { scale });
  }

  async getStatus() {
    return this.sendCommand('GetStatus', {});
  }

  disconnect(): void {
    if (this.pipeHandle) {
      this.pipeHandle.destroy();
      this.pipeHandle = undefined;
    }
    this.connected = false;
  }

  get isConnected(): boolean {
    return this.connected;
  }
}