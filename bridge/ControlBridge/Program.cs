using System;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace ETS2ControlBridge
{
    // 通讯协议
    public record BridgeRequest(string Command, JsonElement? Payload, string RequestId);
    public record BridgeResponse(string RequestId, bool Success, string? Error, JsonElement? Data);

    // 控制指令 - 基础驾驶 (SendInput)
    public enum ControlCommand
    {
        SetThrottle,      // 0.0-1.0
        SetBrake,         // 0.0-1.0
        SetSteering,      // -1.0 到 1.0
        SetClutch,        // 0.0-1.0
        PressKey,         // 虚拟按键
        ReleaseKey,
        TapKey,           // 点击按键
        SetGear,          // -1=R, 0=N, 1-12
        ToggleLight,      // "low", "high", "parking", "beacon", "hazard", "left", "right"
        ToggleCruise,
        SetCruiseSpeed,
        Teleport,         // { x, y, z } 或 "garage" "service" "ferry"
        Refuel,
        Repair,
        SetTimeScale,
        GetStatus,
    }

    // SCS Plugin 指令 - 合法功能 (买车/改装/喷漆)
    public enum ScsCommand
    {
        GetTelemetry,
        GetDealers,
        GetServices,
        BuyTruck,
        SellTruck,
        GetOwnedTrucks,
        CustomizeTruck,
        PaintTruck,
        GetAvailableOptions,
        GetMoney,
        GetStatus,
    }

    class Program
    {
        const string PipeName = "ets2mcp";           // 基础驾驶管道
        const string ScsPipeName = "ets2mcp_scs";    // SCS 插件管道
        
        static readonly InputSimulator Input = new();
        static ScsPipeClient? _scsClient;

        static async Task Main(string[] args)
        {
            Console.WriteLine($"[ETS2ControlBridge] Starting on pipes:");
            Console.WriteLine($"  - \\\\.\\pipe\\{PipeName} (basic control)");
            Console.WriteLine($"  - \\\\.\\pipe\\{ScsPipeName} (SCS plugin)");
            Console.WriteLine("[ETS2ControlBridge] Waiting for MCP server...");

            // Initialize SCS client
            _scsClient = new ScsPipeClient(ScsPipeName);
            _ = _scsClient.ConnectAsync(); // Fire and forget

            while (true)
            {
                try
                {
                    using var server = new NamedPipeServerStream(PipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Message);
                    await server.WaitForConnectionAsync();
                    Console.WriteLine("[ETS2ControlBridge] Basic control client connected");

                    await HandleClient(server);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[ETS2ControlBridge] Error: {ex.Message}");
                    await Task.Delay(1000);
                }
            }
        }

        static async Task HandleClient(NamedPipeServerStream pipe)
        {
            var reader = new StreamReader(pipe, Encoding.UTF8, leaveOpen: true);
            var writer = new StreamWriter(pipe, Encoding.UTF8, leaveOpen: true) { AutoFlush = true };

            while (pipe.IsConnected)
            {
                string? line = await reader.ReadLineAsync();
                if (line == null) break;

                try
                {
                    var req = JsonSerializer.Deserialize<BridgeRequest>(line);
                    if (req == null) continue;

                    var resp = await ExecuteCommand(req);
                    await writer.WriteLineAsync(JsonSerializer.Serialize(resp));
                }
                catch (Exception ex)
                {
                    var errResp = new BridgeResponse("unknown", false, ex.Message, null);
                    await writer.WriteLineAsync(JsonSerializer.Serialize(errResp));
                }
            }
        }

        static async Task<BridgeResponse> ExecuteCommand(BridgeRequest req)
        {
            try
            {
                // Try basic control commands first
                if (Enum.TryParse<ControlCommand>(req.Command, true, out var ctrlCmd))
                {
                    var payload = req.Payload ?? JsonDocument.Parse("{}").RootElement;
                    object? result = ctrlCmd switch
                    {
                        ControlCommand.SetThrottle => await Input.SetAxisAsync("throttle", payload.GetProperty("value").GetSingle()),
                        ControlCommand.SetBrake => await Input.SetAxisAsync("brake", payload.GetProperty("value").GetSingle()),
                        ControlCommand.SetSteering => await Input.SetAxisAsync("steering", payload.GetProperty("value").GetSingle()),
                        ControlCommand.SetClutch => await Input.SetAxisAsync("clutch", payload.GetProperty("value").GetSingle()),
                        ControlCommand.PressKey => await Input.KeyDownAsync(payload.GetProperty("key").GetString()!),
                        ControlCommand.ReleaseKey => await Input.KeyUpAsync(payload.GetProperty("key").GetString()!),
                        ControlCommand.TapKey => await Input.TapKeyAsync(payload.GetProperty("key").GetString()!, payload.TryGetProperty("duration", out var d) ? d.GetInt32() : 50),
                        ControlCommand.SetGear => await Input.SetGearAsync(payload.GetProperty("gear").GetInt32()),
                        ControlCommand.ToggleLight => await Input.ToggleLightAsync(payload.GetProperty("light").GetString()!),
                        ControlCommand.ToggleCruise => await Input.ToggleCruiseAsync(),
                        ControlCommand.SetCruiseSpeed => await Input.SetCruiseSpeedAsync(payload.GetProperty("speed").GetInt32()),
                        ControlCommand.Teleport => await TeleportAsync(payload),
                        ControlCommand.Refuel => await RefuelAsync(),
                        ControlCommand.Repair => await RepairAsync(),
                        ControlCommand.SetTimeScale => await SetTimeScaleAsync(payload.GetProperty("scale").GetSingle()),
                        ControlCommand.GetStatus => GetStatus(),
                        _ => throw new ArgumentException($"Unknown control command: {ctrlCmd}")
                    };

                    return new BridgeResponse(req.RequestId, true, null, 
                        result != null ? JsonSerializer.SerializeToElement(result) : null);
                }

                // Try SCS plugin commands
                if (Enum.TryParse<ScsCommand>(req.Command, true, out var scsCmd))
                {
                    if (_scsClient == null || !_scsClient.IsConnected)
                    {
                        return new BridgeResponse(req.RequestId, false, "SCS plugin not connected. Ensure ets2_mcp_plugin.dll is loaded in game.", null);
                    }

                    var payload = req.Payload ?? JsonDocument.Parse("{}").RootElement;
                    var result = await _scsClient.SendCommandAsync(scsCmd.ToString(), payload);
                    
                    return new BridgeResponse(req.RequestId, true, null, 
                        result != null ? JsonSerializer.SerializeToElement(result) : null);
                }

                throw new ArgumentException($"Unknown command: {req.Command}");
            }
            catch (Exception ex)
            {
                return new BridgeResponse(req.RequestId, false, ex.Message, null);
            }
        }

        // ===== 基础驾驶实现 =====

        static object? GetStatus() => new { 
            connected = true, 
            pid = Input.GameProcessId,
            scsConnected = _scsClient?.IsConnected ?? false
        };

        static async Task<object?> TeleportAsync(JsonElement payload)
        {
            if (payload.ValueKind == JsonValueKind.String)
            {
                var loc = payload.GetString()!.ToLower();
                return await TeleportToPreset(loc);
            }
            else if (payload.TryGetProperty("x", out var x) && payload.TryGetProperty("y", out var y) && payload.TryGetProperty("z", out var z))
            {
                return await TeleportToCoords(x.GetDouble(), y.GetDouble(), z.GetDouble());
            }
            throw new ArgumentException("Invalid teleport payload");
        }

        static async Task<object?> TeleportToPreset(string preset)
        {
            await Input.TapKeyAsync("oem3");
            await Task.Delay(100);
            
            string cmd = preset switch
            {
                "garage" => "g_teleport_to_garage",
                "service" => "g_teleport_to_service",
                "ferry" => "g_teleport_to_ferry",
                "dealer" => "g_teleport_to_dealer",
                _ => throw new ArgumentException($"Unknown preset: {preset}")
            };
            
            await Input.TypeStringAsync(cmd);
            await Input.TapKeyAsync("enter");
            await Task.Delay(100);
            await Input.TapKeyAsync("oem3");
            
            return new { success = true, preset };
        }

        static async Task<object?> TeleportToCoords(double x, double y, double z)
        {
            await Input.TapKeyAsync("oem3");
            await Task.Delay(100);
            await Input.TypeStringAsync($"g_set_time 0");
            await Input.TapKeyAsync("enter");
            await Task.Delay(50);
            await Input.TypeStringAsync($"warp {x} {y} {z}");
            await Input.TapKeyAsync("enter");
            await Task.Delay(100);
            await Input.TapKeyAsync("oem3");
            return new { success = true, x, y, z };
        }

        static async Task<object?> RefuelAsync()
        {
            await Input.TapKeyAsync("e");
            await Task.Delay(500);
            await Input.TapKeyAsync("enter");
            await Task.Delay(2000);
            await Input.TapKeyAsync("escape");
            return new { success = true };
        }

        static async Task<object?> RepairAsync()
        {
            await Input.TapKeyAsync("f7");
            await Task.Delay(300);
            await Input.TapKeyAsync("enter");
            await Task.Delay(1000);
            await Input.TapKeyAsync("escape");
            return new { success = true };
        }

        static async Task<object?> SetTimeScaleAsync(float scale)
        {
            await Input.TapKeyAsync("oem3");
            await Task.Delay(100);
            await Input.TypeStringAsync($"g_set_time {scale}");
            await Input.TapKeyAsync("enter");
            await Task.Delay(50);
            await Input.TapKeyAsync("oem3");
            return new { success = true, scale };
        }
    }

    // ===== SCS Plugin Named Pipe Client =====
    public class ScsPipeClient
    {
        private readonly string _pipeName;
        private NamedPipeClientStream? _pipe;
        private StreamReader? _reader;
        private StreamWriter? _writer;
        private int _requestId = 0;
        private readonly Dictionary<string, TaskCompletionSource<JsonElement>> _pending = new();
        private readonly object _lock = new();

        public ScsPipeClient(string pipeName)
        {
            _pipeName = pipeName;
        }

        public bool IsConnected => _pipe?.IsConnected ?? false;

        public async Task ConnectAsync()
        {
            while (true)
            {
                try
                {
                    _pipe = new NamedPipeClientStream(".", _pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
                    await _pipe.ConnectAsync(5000);
                    
                    _reader = new StreamReader(_pipe, Encoding.UTF8, leaveOpen: true);
                    _writer = new StreamWriter(_pipe, Encoding.UTF8, leaveOpen: true) { AutoFlush = true };
                    
                    Console.WriteLine($"[SCS Client] Connected to {_pipeName}");
                    _ = ReadLoopAsync();
                    return;
                }
                catch
                {
                    await Task.Delay(2000);
                }
            }
        }

        private async Task ReadLoopAsync()
        {
            try
            {
                while (_pipe?.IsConnected == true)
                {
                    string? line = await _reader!.ReadLineAsync();
                    if (line == null) break;

                    try
                    {
                        var doc = JsonDocument.Parse(line);
                        var root = doc.RootElement;
                        
                        if (root.TryGetProperty("requestId", out var idProp))
                        {
                            string requestId = idProp.GetString()!;
                            lock (_lock)
                            {
                                if (_pending.TryGetValue(requestId, out var tcs))
                                {
                                    _pending.Remove(requestId);
                                    if (root.TryGetProperty("success", out var successProp) && successProp.GetBoolean())
                                    {
                                        JsonElement data = root.TryGetProperty("data", out var d) ? d : JsonDocument.Parse("null").RootElement;
                                        tcs.TrySetResult(data);
                                    }
                                    else
                                    {
                                        string error = root.TryGetProperty("error", out var e) ? e.GetString() ?? "Unknown error" : "Unknown error";
                                        tcs.TrySetException(new Exception(error));
                                    }
                                }
                            }
                        }
                    }
                    catch { }
                }
            }
            catch { }
            finally
            {
                Console.WriteLine($"[SCS Client] Disconnected from {_pipeName}");
            }
        }

        public async Task<JsonElement?> SendCommandAsync(string command, JsonElement payload)
        {
            if (_pipe == null || !_pipe.IsConnected)
                throw new InvalidOperationException("SCS pipe not connected");

            string requestId = $"req_{++_requestId}_{DateTime.Now.Ticks}";
            var tcs = new TaskCompletionSource<JsonElement>();
            
            lock (_lock)
            {
                _pending[requestId] = tcs;
            }

            var req = new
            {
                command = command,
                payload = payload.ValueKind == JsonValueKind.Undefined ? (object)new { } : payload,
                requestId = requestId
            };

            string json = JsonSerializer.Serialize(req);
            await _writer!.WriteLineAsync(json);

            // Wait with timeout
            var completedTask = await Task.WhenAny(tcs.Task, Task.Delay(15000));
            if (completedTask == tcs.Task)
            {
                return await tcs.Task;
            }
            else
            {
                lock (_lock) _pending.Remove(requestId);
                throw new TimeoutException($"SCS command '{command}' timed out");
            }
        }
    }

    // ===== 输入模拟器 (Windows SendInput) =====
    public class InputSimulator
    {
        [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
        static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        static extern short VkKeyScan(char ch);

        [System.Runtime.InteropServices.DllImport("kernel32.dll")]
        static extern uint GetCurrentProcessId();

        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
        struct INPUT
        {
            public uint Type;
            public InputUnion Data;
        }

        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Explicit)]
        struct InputUnion
        {
            [System.Runtime.InteropServices.FieldOffset(0)] public MOUSEINPUT Mouse;
            [System.Runtime.InteropServices.FieldOffset(0)] public KEYBDINPUT Keyboard;
        }

        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
        struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public nint dwExtraInfo; }

        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
        struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public nint dwExtraInfo;
        }

        const uint INPUT_KEYBOARD = 1;
        const uint KEYEVENTF_KEYUP = 0x0002;

        static readonly Dictionary<string, ushort> KeyMap = new(StringComparer.OrdinalIgnoreCase)
        {
            ["a"] = 0x41, ["b"] = 0x42, ["c"] = 0x43, ["d"] = 0x44, ["e"] = 0x45, ["f"] = 0x46,
            ["g"] = 0x47, ["h"] = 0x48, ["i"] = 0x49, ["j"] = 0x4A, ["k"] = 0x4B, ["l"] = 0x4C,
            ["m"] = 0x4D, ["n"] = 0x4E, ["o"] = 0x4F, ["p"] = 0x50, ["q"] = 0x51, ["r"] = 0x52,
            ["s"] = 0x53, ["t"] = 0x54, ["u"] = 0x55, ["v"] = 0x56, ["w"] = 0x57, ["x"] = 0x58,
            ["y"] = 0x59, ["z"] = 0x5A,
            ["0"] = 0x30, ["1"] = 0x31, ["2"] = 0x32, ["3"] = 0x33, ["4"] = 0x34,
            ["5"] = 0x35, ["6"] = 0x36, ["7"] = 0x37, ["8"] = 0x38, ["9"] = 0x39,
            ["f1"] = 0x70, ["f2"] = 0x71, ["f3"] = 0x72, ["f4"] = 0x73, ["f5"] = 0x74,
            ["f6"] = 0x75, ["f7"] = 0x76, ["f8"] = 0x77, ["f9"] = 0x78, ["f10"] = 0x79,
            ["f11"] = 0x7A, ["f12"] = 0x7B,
            ["enter"] = 0x0D, ["escape"] = 0x1B, ["space"] = 0x20, ["tab"] = 0x09,
            ["shift"] = 0x10, ["ctrl"] = 0x11, ["alt"] = 0x12,
            ["left"] = 0x25, ["up"] = 0x26, ["right"] = 0x27, ["down"] = 0x28,
            ["oem3"] = 0xC0, ["oem1"] = 0xBA, ["oem2"] = 0xBF,
            ["oem4"] = 0xDB, ["oem5"] = 0xDC, ["oem6"] = 0xDD, ["oem7"] = 0xDE,
            ["oemcomma"] = 0xBC, ["oemperiod"] = 0xBE, ["oemminus"] = 0xBD, ["emplus"] = 0xBB,
        };

        static readonly Dictionary<string, string> Ets2Keys = new(StringComparer.OrdinalIgnoreCase)
        {
            ["throttle"] = "w", ["brake"] = "s", ["steer_left"] = "a", ["steer_right"] = "d",
            ["clutch"] = "space", ["gear_up"] = "oem4", ["gear_down"] = "oem6",
            ["gear_1"] = "1", ["gear_2"] = "2", ["gear_3"] = "3", ["gear_4"] = "4",
            ["gear_5"] = "5", ["gear_6"] = "6", ["gear_7"] = "7", ["gear_8"] = "8",
            ["gear_9"] = "9", ["gear_0"] = "0", ["reverse"] = "r",
            ["light_low"] = "l", ["light_high"] = "k", ["light_parking"] = "oem1",
            ["beacon"] = "o", ["hazard"] = "oem7",
            ["blinker_left"] = "oemcomma", ["blinker_right"] = "oemperiod",
            ["cruise"] = "c", ["cruise_up"] = "emplus", ["cruise_down"] = "oemminus",
            ["horn"] = "h", ["wipers"] = "v", ["engine"] = "e",
            ["menu"] = "escape", ["interact"] = "enter",
            ["camera"] = "c", ["mirror"] = "m", ["map"] = "m",
            ["job_market"] = "j", ["garage"] = "g",
        };

        public int GameProcessId { get; private set; }

        public InputSimulator()
        {
            GameProcessId = (int)GetCurrentProcessId();
            FindGameProcess();
        }

        void FindGameProcess()
        {
            var processes = System.Diagnostics.Process.GetProcessesByName("eurotrucks2");
            if (processes.Length > 0) GameProcessId = processes[0].Id;
        }

        ushort GetVk(string key)
        {
            if (KeyMap.TryGetValue(key.ToLower(), out var vk)) return vk;
            if (Ets2Keys.TryGetValue(key.ToLower(), out var mapped)) return GetVk(mapped);
            if (key.Length == 1) return (ushort)VkKeyScan(key[0]);
            throw new ArgumentException($"Unknown key: {key}");
        }

        void SendKey(ushort vk, bool down)
        {
            var input = new INPUT
            {
                Type = INPUT_KEYBOARD,
                Data = new InputUnion
                {
                    Keyboard = new KEYBDINPUT
                    {
                        wVk = vk, wScan = 0,
                        dwFlags = down ? 0 : KEYEVENTF_KEYUP,
                        time = 0, dwExtraInfo = 0
                    }
                }
            };
            SendInput(1, new[] { input }, System.Runtime.InteropServices.Marshal.SizeOf<INPUT>());
        }

        public async Task KeyDownAsync(string key) { SendKey(GetVk(key), true); await Task.Delay(10); }
        public async Task KeyUpAsync(string key) { SendKey(GetVk(key), false); await Task.Delay(10); }
        public async Task TapKeyAsync(string key, int durationMs = 50) { await KeyDownAsync(key); await Task.Delay(durationMs); await KeyUpAsync(key); }

        public async Task TypeStringAsync(string text)
        {
            foreach (char c in text)
            {
                if (c == ' ') { await TapKeyAsync("space", 20); }
                else
                {
                    var vk = (ushort)VkKeyScan(c);
                    bool shift = char.IsUpper(c) || "~!@#$%^&*()_+{}|:\"<>?".Contains(c);
                    if (shift) await KeyDownAsync("shift");
                    SendKey(vk, true); await Task.Delay(10); SendKey(vk, false);
                    if (shift) await KeyUpAsync("shift");
                    await Task.Delay(10);
                }
            }
        }

        readonly Dictionary<string, Task> _axisTasks = new();

        public async Task SetAxisAsync(string axis, float value)
        {
            value = Math.Clamp(value, -1f, 1f);
            string keyPos, keyNeg;

            switch (axis.ToLower())
            {
                case "throttle": keyPos = "w"; keyNeg = "s"; break;
                case "brake": keyPos = "s"; keyNeg = "w"; break;
                case "steering":
                    if (value > 0) { keyPos = "d"; keyNeg = "a"; }
                    else { keyPos = "a"; keyNeg = "d"; }
                    break;
                case "clutch": keyPos = "space"; keyNeg = ""; break;
                default: throw new ArgumentException($"Unknown axis: {axis}");
            }

            if (_axisTasks.TryGetValue(axis, out var old)) _axisTasks.Remove(axis);

            if (Math.Abs(value) < 0.05f)
            {
                if (!string.IsNullOrEmpty(keyPos)) await KeyUpAsync(keyPos);
                if (!string.IsNullOrEmpty(keyNeg)) await KeyUpAsync(keyNeg);
                return;
            }

            float absVal = Math.Abs(value);
            string activeKey = value > 0 ? keyPos : keyNeg;
            string inactiveKey = value > 0 ? keyNeg : keyPos;

            if (!string.IsNullOrEmpty(inactiveKey)) await KeyUpAsync(inactiveKey);

            var task = Task.Run(async () =>
            {
                try { while (true) { int onMs = (int)(20 * absVal); int offMs = 20 - onMs; await KeyDownAsync(activeKey); await Task.Delay(onMs); await KeyUpAsync(activeKey); await Task.Delay(offMs); } } catch { }
            });

            _axisTasks[axis] = task;
            await Task.Delay(10);
        }

        public async Task SetGearAsync(int gear)
        {
            string key = gear switch { -1 => "r", 0 => "0", >= 1 and <= 9 => gear.ToString(), _ => throw new ArgumentOutOfRangeException(nameof(gear)) };
            await TapKeyAsync(key);
        }

        public async Task ToggleLightAsync(string light)
        {
            string key = light.ToLower() switch { "low" => "l", "high" => "k", "parking" => "oem1", "beacon" => "o", "hazard" => "oem7", "left" => "oemcomma", "right" => "oemperiod", _ => throw new ArgumentException($"Unknown light: {light}") };
            await TapKeyAsync(key);
        }

        public async Task ToggleCruiseAsync() => await TapKeyAsync("c");

        public async Task SetCruiseSpeedAsync(int speedKmh)
        {
            int diff = speedKmh; // simplified
            string key = diff > 0 ? "emplus" : "oemminus";
            for (int i = 0; i < Math.Abs(diff); i++) await TapKeyAsync(key, 30);
        }
    }
}