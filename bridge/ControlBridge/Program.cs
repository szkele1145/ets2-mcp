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

    // 控制指令
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

    class Program
    {
        const string PipeName = "ets2mcp";
        static readonly InputSimulator Input = new();

        static async Task Main(string[] args)
        {
            Console.WriteLine($"[ETS2ControlBridge] Starting on pipe \\\\.\\pipe\\{PipeName}");
            Console.WriteLine("[ETS2ControlBridge] Waiting for MCP server...");

            while (true)
            {
                try
                {
                    using var server = new NamedPipeServerStream(PipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Message);
                    await server.WaitForConnectionAsync();
                    Console.WriteLine("[ETS2ControlBridge] Client connected");

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
                    var errResp = new BridgeResponse(
                        "unknown", false, ex.Message, null);
                    await writer.WriteLineAsync(JsonSerializer.Serialize(errResp));
                }
            }
        }

        static async Task<BridgeResponse> ExecuteCommand(BridgeRequest req)
        {
            try
            {
                var cmd = Enum.Parse<ControlCommand>(req.Command, true);
                var payload = req.Payload ?? JsonDocument.Parse("{}").RootElement;

                object? result = cmd switch
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
                    _ => throw new ArgumentException($"Unknown command: {cmd}")
                };

                return new BridgeResponse(req.RequestId, true, null, 
                    result != null ? JsonSerializer.SerializeToElement(result) : null);
            }
            catch (Exception ex)
            {
                return new BridgeResponse(req.RequestId, false, ex.Message, null);
            }
        }

        // ===== 具体实现 =====

        static object? GetStatus() => new { connected = true, pid = Input.GameProcessId };

        static async Task<object?> TeleportAsync(JsonElement payload)
        {
            // ETS2 瞬移通常通过控制台命令或特定按键序列
            // 这里用控制台命令方式（需游戏启用控制台）
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
            // 打开控制台 -> 输入指令 -> 回车
            await Input.TapKeyAsync("oem3"); // ` 键打开控制台
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
            await Input.TapKeyAsync("oem3"); // 关闭控制台
            
            return new { success = true, preset };
        }

        static async Task<object?> TeleportToCoords(double x, double y, double z)
        {
            await Input.TapKeyAsync("oem3");
            await Task.Delay(100);
            await Input.TypeStringAsync($"g_set_time 0"); // 暂停时间防止物理异常
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
            // 驶入加油区 -> 按 E 或 F 加油 (视模组而定)
            // 这里模拟通用按键序列
            await Input.TapKeyAsync("e"); // 通用交互键
            await Task.Delay(500);
            await Input.TapKeyAsync("enter"); // 确认
            await Task.Delay(2000); // 等待加油动画
            await Input.TapKeyAsync("escape"); // 退出菜单
            return new { success = true };
        }

        static async Task<object?> RepairAsync()
        {
            await Input.TapKeyAsync("f7"); // 默认 F7 进维修菜单 (需模组)
            await Task.Delay(300);
            await Input.TapKeyAsync("enter"); // 确认维修
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

    // ===== 输入模拟器 (Windows SendInput) =====
    public class InputSimulator
    {
        // Win32 API
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
        const uint KEYEVENTF_SCANCODE = 0x0008;
        const uint KEYEVENTF_UNICODE = 0x0004;

        // 虚拟键码
        static readonly Dictionary<string, ushort> KeyMap = new(StringComparer.OrdinalIgnoreCase)
        {
            // 字母
            ["a"] = 0x41, ["b"] = 0x42, ["c"] = 0x43, ["d"] = 0x44, ["e"] = 0x45, ["f"] = 0x46,
            ["g"] = 0x47, ["h"] = 0x48, ["i"] = 0x49, ["j"] = 0x4A, ["k"] = 0x4B, ["l"] = 0x4C,
            ["m"] = 0x4D, ["n"] = 0x4E, ["o"] = 0x4F, ["p"] = 0x50, ["q"] = 0x51, ["r"] = 0x52,
            ["s"] = 0x53, ["t"] = 0x54, ["u"] = 0x55, ["v"] = 0x56, ["w"] = 0x57, ["x"] = 0x58,
            ["y"] = 0x59, ["z"] = 0x5A,
            // 数字
            ["0"] = 0x30, ["1"] = 0x31, ["2"] = 0x32, ["3"] = 0x33, ["4"] = 0x34,
            ["5"] = 0x35, ["6"] = 0x36, ["7"] = 0x37, ["8"] = 0x38, ["9"] = 0x39,
            // 功能键
            ["f1"] = 0x70, ["f2"] = 0x71, ["f3"] = 0x72, ["f4"] = 0x73, ["f5"] = 0x74,
            ["f6"] = 0x75, ["f7"] = 0x76, ["f8"] = 0x77, ["f9"] = 0x78, ["f10"] = 0x79,
            ["f11"] = 0x7A, ["f12"] = 0x7B,
            // 特殊
            ["enter"] = 0x0D, ["escape"] = 0x1B, ["space"] = 0x20, ["tab"] = 0x09,
            ["shift"] = 0x10, ["ctrl"] = 0x11, ["alt"] = 0x12,
            ["left"] = 0x25, ["up"] = 0x26, ["right"] = 0x27, ["down"] = 0x28,
            ["oem3"] = 0xC0, // ` ~
            ["oem1"] = 0xBA, // ; :
            ["oem2"] = 0xBF, // / ?
            ["oem4"] = 0xDB, // [ {
            ["oem5"] = 0xDC, // \ |
            ["oem6"] = 0xDD, // ] }
            ["oem7"] = 0xDE, // ' "
            ["oemcomma"] = 0xBC, // , <
            ["oemperiod"] = 0xBE, // . >
            ["oemminus"] = 0xBD, // - _
            ["emplus"] = 0xBB, // = +
        };

        // ETS2 默认按键映射
        static readonly Dictionary<string, string> Ets2Keys = new(StringComparer.OrdinalIgnoreCase)
        {
            ["throttle"] = "w", ["brake"] = "s", ["steer_left"] = "a", ["steer_right"] = "d",
            ["clutch"] = "space", ["gear_up"] = "oem4", ["gear_down"] = "oem6", // [ ]
            ["gear_1"] = "1", ["gear_2"] = "2", ["gear_3"] = "3", ["gear_4"] = "4",
            ["gear_5"] = "5", ["gear_6"] = "6", ["gear_7"] = "7", ["gear_8"] = "8",
            ["gear_9"] = "9", ["gear_0"] = "0",
            ["reverse"] = "r",
            ["light_low"] = "l", ["light_high"] = "k", ["light_parking"] = "oem1", // ;
            ["beacon"] = "o", ["hazard"] = "oem7", // '
            ["blinker_left"] = "oemcomma", // ,
            ["blinker_right"] = "oemperiod", // .
            ["cruise"] = "c", ["cruise_up"] = "oemplus", ["cruise_down"] = "oemminus", // = -
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
            if (processes.Length > 0)
                GameProcessId = processes[0].Id;
        }

        ushort GetVk(string key)
        {
            if (KeyMap.TryGetValue(key.ToLower(), out var vk)) return vk;
            if (Ets2Keys.TryGetValue(key.ToLower(), out var mapped)) return GetVk(mapped);
            // 尝试单字符
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
                        wVk = vk,
                        wScan = 0,
                        dwFlags = down ? 0 : KEYEVENTF_KEYUP,
                        time = 0,
                        dwExtraInfo = 0
                    }
                }
            };
            SendInput(1, new[] { input }, System.Runtime.InteropServices.Marshal.SizeOf<INPUT>());
        }

        public async Task KeyDownAsync(string key)
        {
            SendKey(GetVk(key), true);
            await Task.Delay(10);
        }

        public async Task KeyUpAsync(string key)
        {
            SendKey(GetVk(key), false);
            await Task.Delay(10);
        }

        public async Task TapKeyAsync(string key, int durationMs = 50)
        {
            await KeyDownAsync(key);
            await Task.Delay(durationMs);
            await KeyUpAsync(key);
        }

        public async Task TypeStringAsync(string text)
        {
            foreach (char c in text)
            {
                if (c == ' ')
                {
                    await TapKeyAsync("space", 20);
                }
                else
                {
                    var vk = (ushort)VkKeyScan(c);
                    bool shift = char.IsUpper(c) || "~!@#$%^&*()_+{}|:\"<>?".Contains(c);
                    if (shift) await KeyDownAsync("shift");
                    SendKey(vk, true);
                    await Task.Delay(10);
                    SendKey(vk, false);
                    if (shift) await KeyUpAsync("shift");
                    await Task.Delay(10);
                }
            }
        }

        // 轴输入模拟：用按键按住/释放模拟模拟量
        // 注意：真正的模拟量需要 vJoy 或 Raw Input，这里简化为按键 PWM
        readonly Dictionary<string, Task> _axisTasks = new();

        public async Task SetAxisAsync(string axis, float value) // -1.0 到 1.0
        {
            value = Math.Clamp(value, -1f, 1f);
            string keyPos, keyNeg;

            switch (axis.ToLower())
            {
                case "throttle": keyPos = "w"; keyNeg = "s"; break;
                case "brake": keyPos = "s"; keyNeg = "w"; break; // 刹车通常是 S
                case "steering":
                    if (value > 0) { keyPos = "d"; keyNeg = "a"; }
                    else { keyPos = "a"; keyNeg = "d"; }
                    break;
                case "clutch": keyPos = "space"; keyNeg = ""; break;
                default: throw new ArgumentException($"Unknown axis: {axis}");
            }

            // 取消旧任务
            if (_axisTasks.TryGetValue(axis, out var old))
            {
                _axisTasks.Remove(axis);
            }

            if (Math.Abs(value) < 0.05f)
            {
                // 释放所有
                if (!string.IsNullOrEmpty(keyPos)) await KeyUpAsync(keyPos);
                if (!string.IsNullOrEmpty(keyNeg)) await KeyUpAsync(keyNeg);
                return;
            }

            // 启动 PWM 任务
            float absVal = Math.Abs(value);
            string activeKey = value > 0 ? keyPos : keyNeg;
            string inactiveKey = value > 0 ? keyNeg : keyPos;

            if (!string.IsNullOrEmpty(inactiveKey)) await KeyUpAsync(inactiveKey);

            var task = Task.Run(async () =>
            {
                try
                {
                    while (true)
                    {
                        int onMs = (int)(20 * absVal);
                        int offMs = 20 - onMs;
                        await KeyDownAsync(activeKey);
                        await Task.Delay(onMs);
                        await KeyUpAsync(activeKey);
                        await Task.Delay(offMs);
                    }
                }
                catch { }
            });

            _axisTasks[axis] = task;
            await Task.Delay(10);
        }

        public async Task SetGearAsync(int gear)
        {
            // ETS2: 1-9 数字键对应档位, 0=10档, -1=R
            string key = gear switch
            {
                -1 => "r",
                0 => "0", // 空档通常不需要按键，这里按 0
                >= 1 and <= 9 => gear.ToString(),
                _ => throw new ArgumentOutOfRangeException(nameof(gear))
            };
            await TapKeyAsync(key);
        }

        public async Task ToggleLightAsync(string light)
        {
            string key = light.ToLower() switch
            {
                "low" => "l",
                "high" => "k",
                "parking" => "oem1", // ;
                "beacon" => "o",
                "hazard" => "oem7", // '
                "left" => "oemcomma", // ,
                "right" => "oemperiod", // .
                _ => throw new ArgumentException($"Unknown light: {light}")
            };
            await TapKeyAsync(key);
        }

        public async Task ToggleCruiseAsync() => await TapKeyAsync("c");

        public async Task SetCruiseSpeedAsync(int speedKmh)
        {
            // 巡航调速: + / - 键
            int current = 0; // 无法读取当前值，简化处理
            int diff = speedKmh - current;
            string key = diff > 0 ? "oemplus" : "oemminus";
            for (int i = 0; i < Math.Abs(diff); i++)
                await TapKeyAsync(key, 30);
        }
    }
}