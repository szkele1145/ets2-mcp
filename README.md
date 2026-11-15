# ETS2 MCP Server

**Model Context Protocol (MCP) server for Euro Truck Simulator 2** — read live telemetry **and** control the truck via simulated input.

> **One plugin, full control.** Telemetry via HTTP, control via Windows SendInput (no memory injection, no anti-cheat issues).

---

## ✨ Features

| Category | Capabilities |
|----------|--------------|
| **📊 Telemetry (Read)** | Speed, RPM, gear, fuel, damage, lights, cruise, odometer, trailer cargo, job route, navigation, weather, GPS |
| **🎮 Control (Write) — SendInput** | Throttle/brake/steering/clutch axes, gear shifts, all lights, cruise control, teleport, refuel, repair, time scale |
| **🏪 SCS Plugin (Legal Write)** | **Buy trucks at dealers**, **customize at service** (engine/transmission/chassis/cabin/accessories), **paint** (color/metallic/gloss/decal), list owned trucks, get money |
| **🤖 Driving Helpers** | Drive straight at speed, turn left/right, emergency stop, auto-follow GPS navigation |
| **🔧 Utilities** | km/h ↔ mph, decimal ↔ DMS coordinates |

**46 MCP tools** + **6 resources** — everything an agent needs to drive, navigate, manage jobs, **buy trucks, customize, and paint legally**.

---

## 📋 Prerequisites

| Component | Required? | Purpose |
|-----------|-----------|---------|
| **ETS2 (Steam)** | ✅ Yes | The game |
| **Funbit Telemetry Server** | ✅ Yes | Exposes game data via HTTP (shared memory → HTTP) |
| **ETS2 MCP Plugin** | ✅ For SCS features | C++ DLL for legal buy/customize/paint (in release zip) |
| **Windows 10/11** | ✅ Yes | Control Bridge uses Windows `SendInput` |
| **Node.js 20+** | ✅ Yes | Runs MCP server |
| **.NET 8 SDK** | 📦 Build only | Compile Control Bridge (prebuilt in releases) |
| **CMake + MSVC** | 📦 Build only | Compile SCS plugin (prebuilt in releases) |

---

## 🚀 Quick Start (End User — 3 Minutes)

### Step 1: Install Funbit Telemetry Server (One-time)

1. Download latest release: **[Funbit/ets2-telemetry-server/releases](https://github.com/Funbit/ets2-telemetry-server/releases)**
2. Extract `ets2-telemetry-server.dll` (and `config.json` if present) to:
   ```
   <SteamLibrary>\steamapps\common\Euro Truck Simulator 2\bin\win_x64\plugins\
   ```

### Step 2: Install ETS2 MCP Plugin (for legal buy/customize/paint)

1. From the release zip, copy `ets2_mcp_plugin.dll` to the **same plugins folder**:
   ```
   <SteamLibrary>\steamapps\common\Euro Truck Simulator 2\bin\win_x64\plugins\
   ```
2. Launch ETS2 → drive into world → the plugin auto-loads and creates named pipe `\\.\pipe\ets2mcp_scs`

### Step 3: Get ETS2 MCP

**Option A: Prebuilt Release (Recommended)**
- Download `ets2-mcp-vX.Y.Z-windows.zip` from **[GitHub Releases](https://github.com/szkele1145/ets2-mcp/releases)**
- Extract anywhere (e.g., `C:\ets2-mcp\`)

**Option B: Build from Source**
```bash
git clone https://github.com/szkele1145/ets2-mcp.git
cd ets2-mcp
npm ci
npm run build
# Build Control Bridge (Windows only):
cd bridge/ControlBridge
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true
# Build SCS Plugin (Windows only, requires CMake + MSVC):
cd ../../bridge/ScsPlugin
cmake -B build -S . -DCMAKE_BUILD_TYPE=Release -A x64
cmake --build build --config Release
# Copy .exe and .dll to dist/ or root
```

### Step 4: Run Both Components

**Terminal 1 — Control Bridge (Run as Administrator)**
```cmd
# Required for SendInput to work when game is focused
ETS2ControlBridge.exe
```
Output:
```
[ETS2ControlBridge] Starting on pipes:
  - \\.\pipe\ets2mcp (basic control)
  - \\.\pipe\ets2mcp_scs (SCS plugin)
[ETS2ControlBridge] Waiting for MCP server...
```

**Terminal 2 — MCP Server**
```cmd
node dist/index.js
```
Output:
```
[ETS2 MCP] Server started on stdio
```

### Step 5: Configure Your MCP Client

Add to your MCP client config (Claude Desktop, Cursor, VS Code, etc.):

```json
{
  "mcpServers": {
    "ets2": {
      "command": "node",
      "args": ["C:\\path\\to\\ets2-mcp\\dist\\index.js"],
      "env": {
        "ETS2_HOST": "127.0.0.1",
        "ETS2_PORT": "25555"
      }
    }
  }
}
```

> **Tip**: Use the provided `mcp-config.json` as reference.

### Step 5: Test with Agent

```
You: "Connect to my truck"
Agent: → ets2_connect → "Connected to ETS2 telemetry at 127.0.0.1:25555"

You: "Connect the control bridge"
Agent: → ets2_bridge_connect → "Control bridge connected"

You: "Drive to Hamburg at 80 km/h"
Agent: → ets2_drive_straight {speedKmh: 80} → "Driving straight at 80 km/h"
```

---

## 🎮 All 46 MCP Tools

### Connection (7)
| Tool | Description |
|------|-------------|
| `ets2_connect` | Connect to HTTP telemetry server |
| `ets2_disconnect` | Disconnect telemetry |
| `ets2_connection_status` | Check telemetry connection |
| `ets2_bridge_connect` | Connect to Control Bridge (basic control pipe) |
| `ets2_bridge_status` | Check basic control bridge connection |
| `ets2_scs_connect` | Connect to SCS plugin (legal buy/customize/paint) |
| `ets2_scs_status` | Check SCS plugin connection |

### Telemetry — Read (11)
| Tool | Returns |
|------|---------|
| `ets2_get_truck` | Speed, RPM, gear, fuel, damage, lights, cruise, position, odometer |
| `ets2_get_trailer` | Attached, cargo name, mass, damage, position |
| `ets2_get_job` | Route, cargo, deadline, income, distance, time remaining |
| `ets2_get_navigation` | Next turn, distance, speed limit, road name, ETA |
| `ets2_get_weather` | Rain, fog, wind, temperature, cloudiness |
| `ets2_get_gps` | Latitude, longitude, altitude, heading |
| `ets2_get_full_snapshot` | Everything above in one call |
| `ets2_get_fuel_status` | Current L, capacity, %, consumption, range, refuel advice |
| `ets2_get_damage_report` | Truck % (engine, transmission, cabin, chassis, wheels), trailer % |
| `ets2_get_driving_status` | Speed, gear, RPM, throttle/brake/steering %, cruise, lights |
| `ets2_get_job_progress` | Distance left, time left, on-time status, income |

### Control — Write (13) — *Requires `ets2_bridge_connect` first (SendInput)*
| Tool | Parameters | Example |
|------|------------|---------|
| `ets2_set_throttle` | `value: 0–1` | `0.7` |
| `ets2_set_brake` | `value: 0–1` | `0.5` |
| `ets2_set_steering` | `value: -1 to 1` | `-0.3` (left) |
| `ets2_set_clutch` | `value: 0–1` | `0.0` |
| `ets2_tap_key` | `key: string, duration?: ms` | `"w"`, `"c"`, `"1"` |
| `ets2_set_gear` | `gear: -1 to 12` | `1`, `-1` (R), `0` (N) |
| `ets2_toggle_light` | `light: low/high/parking/beacon/hazard/left/right` | `"low"` |
| `ets2_toggle_cruise` | — | — |
| `ets2_set_cruise_speed` | `speed: 0–150 km/h` | `90` |
| `ets2_teleport` | `preset: garage/service/ferry/dealer` OR `x,y,z` | `"garage"` |
| `ets2_refuel` | — | — |
| `ets2_repair` | — | — |
| `ets2_set_time_scale` | `scale: 0.1–100` | `10` |

### SCS Plugin — Legal Write (11) — *Requires `ets2_scs_connect` first (C++ DLL)*
| Tool | Parameters | Use Case |
|------|------------|----------|
| `ets2_dealer_list` | `maxDistanceKm?: number` | Find nearby dealers (brands, location, distance) |
| `ets2_service_list` | `maxDistanceKm?: number` | Find nearby service shops (customize/paint) |
| `ets2_buy_truck` | `makeId, modelId, engineId?, transmissionId?, chassisId?, cabinId?, paintId?, accessoryIds?` | **Buy truck at dealer** (must be at dealer, needs money) |
| `ets2_sell_truck` | `truckId: string` | Sell truck from garage |
| `ets2_owned_trucks` | — | List all owned trucks in garage |
| `ets2_customize_truck` | `makeId, modelId, engineId?, transmissionId?, chassisId?, cabinId?, paintId?, accessoryIds?` | **Customize at service** (engine, transmission, chassis, cabin, accessories) |
| `ets2_paint_truck` | `baseColor (0xRRGGBB), secondaryColor?, metallic?, gloss?, decalId?, decalColorId?` | **Paint at service** (color, metallic, gloss, decal) |
| `ets2_available_options` | — | Get available engines, transmissions, chassis, cabins, paints, accessories for current truck |
| `ets2_money` | — | Get current money balance |

### Driving Helpers (4)
| Tool | Parameters | Use Case |
|------|------------|----------|
| `ets2_drive_straight` | `speedKmh: number` | Maintain speed on highway |
| `ets2_turn` | `direction: left/right, intensity?: 0.1–1, duration?: ms` | Navigate corners |
| `ets2_stop` | — | Emergency brake |
| `ets2_follow_navigation` | — | Auto-steer to next waypoint |

### Utilities (2)
| Tool | Description |
|------|-------------|
| `ets2_speed_kmh_to_mph` | Convert km/h → mph |
| `ets2_format_coordinates` | Decimal lat/lon → DMS |

---

## 📦 Resources (Auto-refresh via MCP)

| URI | Data |
|-----|------|
| `ets2://truck` | Live truck telemetry |
| `ets2://trailer` | Trailer data |
| `ets2://job` | Active job |
| `ets2://navigation` | GPS navigation |
| `ets2://weather` | Weather |
| `ets2://snapshot` | Full snapshot |

---

## 💬 Example Agent Workflows

### "Drive me to the destination"
```json
// Agent calls in sequence:
1. ets2_bridge_connect
2. ets2_tap_key {key: "e"}        // Start engine
3. ets2_set_gear {gear: 1}
4. ets2_drive_straight {speedKmh: 85}
5. ets2_follow_navigation          // Auto-steer at intersections
```

### "Night delivery with lights"
```
ets2_toggle_light {light: "low"}
ets2_toggle_light {light: "high"}
ets2_drive_straight {speedKmh: 80}
```

### "Quick garage visit"
```
ets2_teleport {preset: "garage"}
ets2_refuel
ets2_repair
```

### "Check if I'll make the deadline"
```
ets2_get_job_progress → "142 km, 2h 15m left, ON TIME, €12,450"
ets2_get_fuel_status → "340L (68%), range 920 km — OK"
ets2_get_navigation → "Left in 500m onto A7, limit 80"
```

### "Buy a new Scania R730"
```
ets2_scs_connect                          // Connect to SCS plugin
ets2_dealer_list {maxDistanceKm: 50}      // Find Scania dealer nearby
ets2_money                                // Check balance
ets2_buy_truck {                          // Buy at dealer
  makeId: "scania",
  modelId: "scania_r_2016",
  engineId: "scania_dc16_730",
  transmissionId: "grso_12_speed",
  chassisId: "6x4",
  cabinId: "scania_r_streamline"
}
```

### "Fully customize current truck"
```
ets2_scs_connect
ets2_service_list {maxDistanceKm: 30}     // Find service shop
ets2_available_options                    // See what's available
ets2_customize_truck {                    // Upgrade everything
  makeId: "scania",
  modelId: "scania_r_2016",
  engineId: "scania_dc16_730",
  transmissionId: "grso_12_speed",
  chassisId: "6x4",
  cabinId: "scania_r_streamline",
  accessoryIds: ["roof_lights", "bullbar", "side_skirt"]
}
ets2_paint_truck {                        // Custom paint
  baseColor: 0x1a1a2e,    // Dark blue
  metallic: 0.8,
  gloss: 0.9,
  decalId: "scania_griffin"
}
```

---

## 🏗 Architecture

```
┌─────────────┐     stdio      ┌──────────────────┐
│  MCP Client │◄──────────────►│  MCP Server      │
│  (Agent)    │   (JSON-RPC)   │  (Node.js/TS)    │
└─────────────┘                └────────┬─────────┘
                                        │
                              ┌─────────┴─────────┐
                              ▼                   ▼
                     ┌──────────────┐     ┌────────────────┐
                     │ Telemetry    │     │ Control Bridge │
                     │ Server (HTTP)│     │ (Named Pipe)   │
                     │ Port 25555   │     │ ETS2ControlBridge│
                     └──────────────┘     └───────┬────────┘
                                                   │
                              ┌───────────────────┼───────────────────┐
                              ▼                   ▼                   ▼
                     ┌──────────────┐     ┌──────────────┐    ┌──────────────────┐
                     │ ETS2 Process │     │ Windows      │    │ C++ SCS Plugin   │
                     │ Shared Mem   │     │ SendInput    │    │ (In-process DLL) │
                     │ (Funbit DLL) │     │ (keystrokes) │    │ - BuyTruck()     │
                     └──────────────┘     └──────────────┘    │ - Customize()    │
                                                               │ - Paint()        │
                                                               │ - GetDealers()   │
                                                               └──────────────────┘
```

- **Telemetry**: Funbit plugin reads game shared memory → HTTP JSON on `:25555`
- **Control (SendInput)**: Bridge simulates keyboard via `SendInput` — **no DLL injection**, works on all game versions
- **SCS Plugin (Legal)**: In-process C++ DLL using SCS SDK — **buy trucks, customize, paint** at dealer/service (requires `ets2_mcp_plugin.dll` in plugins folder)

---

## ⚙️ Configuration

### Environment Variables (MCP Server)
| Variable | Default | Description |
|----------|---------|-------------|
| `ETS2_HOST` | `127.0.0.1` | Telemetry server host |
| `ETS2_PORT` | `25555` | Telemetry server port |
| `ETS2_ENDPOINT` | `/api/telemetry` | Telemetry API path |
| `ETS2_INTERVAL` | `100` | Poll interval (ms) |
| `ETS2_TIMEOUT` | `5000` | Request timeout (ms) |

### Command Line Overrides
```bash
node dist/index.js --host 127.0.0.1 --port 25555 --endpoint /api/telemetry --interval 100 --timeout 5000
```

### ETS2 Key Bindings (Assumed by Bridge)
| Action | Default Key | In-Game Setting |
|--------|-------------|-----------------|
| Throttle | `W` | Accelerate |
| Brake | `S` | Brake |
| Steer Left | `A` | Steer Left |
| Steer Right | `D` | Steer Right |
| Clutch | `Space` | Clutch |
| Gear 1–9 | `1`–`9` | Gear 1–9 |
| Gear 10 | `0` | Gear 10 |
| Reverse | `R` | Reverse Gear |
| Low Beam | `L` | Lights: Low Beam |
| High Beam | `K` | Lights: High Beam |
| Parking | `;` | Lights: Parking |
| Beacon | `O` | Beacon |
| Hazards | `'` | Hazard Lights |
| Left Blinker | `,` | Turn Signal Left |
| Right Blinker | `.` | Turn Signal Right |
| Cruise Toggle | `C` | Cruise Control |
| Cruise + | `=` | Cruise Speed + |
| Cruise - | `-` | Cruise Speed - |
| Engine Start | `E` | Engine Start/Stop |
| Console | `` ` `` | (Enable in config.cfg) |

> **If your bindings differ**: Edit `Ets2Keys` dict in `bridge/ControlBridge/Program.cs` and rebuild.

---

## 🔧 Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `"Connect to ETS2 first"` | Telemetry not running | 1. Launch game 2. Enter world (not menu) 3. Check `http://127.0.0.1:25555/api/telemetry` |
| Bridge connect failed | Pipe not found | 1. Run `ETS2ControlBridge.exe` as **Administrator** 2. Check Windows Defender isn't blocking named pipes |
| Input not working | Game not focused / no Admin | 1. Run bridge as Admin 2. Click game window to focus 3. Verify ETS2 key bindings match table above |
| `"Control bridge not connected"` | Forgot to connect | Call `ets2_bridge_connect` before any control tool |
| Teleport fails | Console disabled | Edit `config.cfg`: `g_console 1`, `g_developer 1` |
| No trailer data | No trailer attached | Hook up a trailer in-game |
| Native module errors | — | This project uses **zero native Node modules** — HTTP + SendInput only |

---

## 📁 Project Structure

```
ets2-mcp/
├── .github/workflows/ci.yml      # GitHub Actions: build, test, release
├── src/                          # TypeScript source
│   ├── index.ts                  # Entry point
│   ├── mcp-server.ts             # MCP server + 31 tools
│   ├── bridge-client.ts          # Named pipe client
│   ├── telemetry-client.ts       # HTTP telemetry client
│   └── types.ts                  # TypeScript interfaces
├── bridge/ControlBridge/         # C# Control Bridge
│   ├── ControlBridge.csproj      # Project file
│   ├── Program.cs                # SendInput, pipe server, all commands
│   └── Properties/launchSettings.json
├── dist/                         # Compiled JS (gitignored, in releases)
├── README.md                     # This file
├── mcp-config.json               # MCP client config example
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## 🛠 Development

```bash
# Install deps
npm ci

# Watch mode (auto-rebuild on save)
npm run dev

# Typecheck only
npm run build

# Build Control Bridge (Windows)
cd bridge/ControlBridge
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true
# Output: bin/Release/net8.0/win-x64/publish/ETS2ControlBridge.exe
```

---

## 📦 Release Process

1. Push tag: `git tag v1.2.3 && git push origin v1.2.3`
2. GitHub Actions:
   - Builds TS + C# on Ubuntu + Windows
   - Creates `ets2-mcp-v1.2.3-windows.zip` with:
     - `dist/` (MCP server)
     - `ETS2ControlBridge.exe` (Control Bridge)
     - `README.md`, `mcp-config.json`
   - Publishes to GitHub Releases with auto-generated notes

---

## 📄 License

**MIT** — Free for personal and commercial use.

---

## 🙏 Credits

| Project | Role |
|---------|------|
| **Funbit/ets2-telemetry-server** | Shared memory → HTTP telemetry plugin |
| **SCS Software** | Euro Truck Simulator 2 |
| **Anthropic** | Model Context Protocol spec |
| **Microsoft** | .NET, SendInput API |

---

## 🤝 Contributing

1. Fork → feature branch → PR
2. `npm run build` must pass
3. Update README if adding tools
4. Test with actual ETS2 running

---

**Happy trucking!** 🚛💨  
*Issues? Open a GitHub Issue with logs from both terminals.*