/**
 * ETS2 MCP SCS Plugin
 * Provides legal truck buying, customization, and painting via SCS SDK
 * Communicates with C# Control Bridge via Named Pipe
 */

#include "scs_sdk_minimal.h"
#include <windows.h>
#include <string>
#include <vector>
#include <mutex>
#include <thread>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <json/json.h>  // We'll use a simple JSON implementation

// ============================================================================
// Simple JSON Implementation (header-only, no external deps)
// ============================================================================

namespace json {
    enum class Type { Null, Bool, Int, Double, String, Array, Object };
    
    class Value {
    public:
        Value() : type(Type::Null) {}
        Value(bool b) : type(Type::Bool), bool_val(b) {}
        Value(int i) : type(Type::Int), int_val(i) {}
        Value(double d) : type(Type::Double), double_val(d) {}
        Value(const char* s) : type(Type::String), str_val(s) {}
        Value(const std::string& s) : type(Type::String), str_val(s) {}
        
        // Array/Object constructors
        static Value Array() { Value v; v.type = Type::Array; return v; }
        static Value Object() { Value v; v.type = Type::Object; return v; }
        
        // Array operations
        Value& operator[](size_t idx) {
            if (type != Type::Array) { type = Type::Array; }
            if (idx >= arr_val.size()) arr_val.resize(idx + 1);
            return arr_val[idx];
        }
        void push_back(const Value& v) {
            if (type != Type::Array) { type = Type::Array; }
            arr_val.push_back(v);
        }
        
        // Object operations
        Value& operator[](const char* key) {
            if (type != Type::Object) { type = Type::Object; }
            return obj_val[key];
        }
        Value& operator[](const std::string& key) { return operator[](key.c_str()); }
        
        // Type checks
        bool is_null() const { return type == Type::Null; }
        bool is_bool() const { return type == Type::Bool; }
        bool is_int() const { return type == Type::Int; }
        bool is_double() const { return type == Type::Double; }
        bool is_string() const { return type == Type::String; }
        bool is_array() const { return type == Type::Array; }
        bool is_object() const { return type == Type::Object; }
        
        // Getters
        bool as_bool() const { return bool_val; }
        int as_int() const { return int_val; }
        double as_double() const { return double_val; }
        const std::string& as_string() const { return str_val; }
        const std::vector<Value>& as_array() const { return arr_val; }
        const std::map<std::string, Value>& as_object() const { return obj_val; }
        
        // Serialize
        std::string dump(int indent = -1) const {
            std::string result;
            dump_recursive(result, indent, 0);
            return result;
        }
        
    private:
        Type type;
        bool bool_val = false;
        int int_val = 0;
        double double_val = 0.0;
        std::string str_val;
        std::vector<Value> arr_val;
        std::map<std::string, Value> obj_val;
        
        void dump_recursive(std::string& out, int indent, int level) const {
            std::string pad;
            if (indent > 0) {
                pad = "\n" + std::string(level * indent, ' ');
            }
            
            switch (type) {
                case Type::Null: out += "null"; break;
                case Type::Bool: out += bool_val ? "true" : "false"; break;
                case Type::Int: out += std::to_string(int_val); break;
                case Type::Double: {
                    char buf[64];
                    snprintf(buf, sizeof(buf), "%.6g", double_val);
                    out += buf;
                    break;
                }
                case Type::String: {
                    out += '"';
                    for (char c : str_val) {
                        switch (c) {
                            case '"': out += "\\\""; break;
                            case '\\': out += "\\\\"; break;
                            case '\b': out += "\\b"; break;
                            case '\f': out += "\\f"; break;
                            case '\n': out += "\\n"; break;
                            case '\r': out += "\\r"; break;
                            case '\t': out += "\\t"; break;
                            default: out += c; break;
                        }
                    }
                    out += '"';
                    break;
                }
                case Type::Array: {
                    out += '[';
                    for (size_t i = 0; i < arr_val.size(); ++i) {
                        if (i > 0) out += ',' + std::string(indent > 0 ? " " : "");
                        if (indent > 0) out += pad;
                        arr_val[i].dump_recursive(out, indent, level + 1);
                    }
                    if (!arr_val.empty() && indent > 0) out += pad.substr(0, pad.size() - indent);
                    out += ']';
                    break;
                }
                case Type::Object: {
                    out += '{';
                    bool first = true;
                    for (const auto& kv : obj_val) {
                        if (!first) out += ',' + std::string(indent > 0 ? " " : "");
                        first = false;
                        if (indent > 0) out += pad;
                        out += '"' + kv.first + "\":";
                        if (indent > 0) out += ' ';
                        kv.second.dump_recursive(out, indent, level + 1);
                    }
                    if (!obj_val.empty() && indent > 0) out += pad.substr(0, pad.size() - indent);
                    out += '}';
                    break;
                }
            }
        }
    };
}

// ============================================================================
// Plugin State
// ============================================================================

static scs_context_t g_context = nullptr;
static const scs_telemetry_api_t* g_telemetry_api = nullptr;
static const scs_vehicle_api_t* g_vehicle_api = nullptr;
static const scs_economy_api_t* g_economy_api = nullptr;
static const scs_context_api_t* g_context_api = nullptr;

// Named pipe to C# bridge
static HANDLE g_pipe = INVALID_HANDLE_VALUE;
static std::thread g_pipe_thread;
static std::mutex g_pipe_mutex;
static bool g_pipe_running = false;

// Plugin config
static const char* PLUGIN_NAME = "ets2_mcp_plugin";
static const char* PIPE_NAME = "\\\\.\\pipe\\ets2mcp_scs";

// Logging helper
static void log_msg(int level, const char* fmt, ...) {
    if (g_context_api && g_context) {
        va_list args;
        va_start(args, fmt);
        char buffer[1024];
        vsnprintf(buffer, sizeof(buffer), fmt, args);
        va_end(args);
        g_context_api->log(g_context, level, "%s", buffer);
    }
}

// ============================================================================
// Named Pipe Communication with C# Bridge
// ============================================================================

struct PipeCommand {
    std::string command;
    json::Value payload;
    std::string request_id;
};

struct PipeResponse {
    std::string request_id;
    bool success;
    std::string error;
    json::Value data;
};

static void send_pipe_response(const PipeResponse& resp) {
    std::lock_guard<std::mutex> lock(g_pipe_mutex);
    if (g_pipe == INVALID_HANDLE_VALUE) return;
    
    json::Value root = json::Value::Object();
    root["requestId"] = resp.request_id;
    root["success"] = resp.success;
    if (!resp.error.empty()) root["error"] = resp.error;
    if (!resp.data.is_null()) root["data"] = resp.data;
    
    std::string msg = root.dump() + "\n";
    DWORD written;
    WriteFile(g_pipe, msg.c_str(), (DWORD)msg.size(), &written, nullptr);
}

static json::Value vec3_to_json(const scs_vec3_t& v) {
    json::Value obj = json::Value::Object();
    obj["x"] = v.x;
    obj["y"] = v.y;
    obj["z"] = v.z;
    return obj;
}

static json::Value telemetry_to_json(const scs_full_telemetry_t& t) {
    json::Value root = json::Value::Object();
    
    // Truck
    json::Value truck = json::Value::Object();
    truck["truckId"] = t.truck.truck_id ? t.truck.truck_id : "";
    truck["truckMake"] = t.truck.truck_make ? t.truck.truck_make : "";
    truck["truckModel"] = t.truck.truck_model ? t.truck.truck_model : "";
    truck["speed"] = t.truck.speed;
    truck["speedKmh"] = t.truck.speed * 3.6f;
    truck["engineRpm"] = t.truck.engine_rpm;
    truck["engineRpmMax"] = t.truck.engine_rpm_max;
    truck["gear"] = t.truck.gear;
    truck["gearCount"] = t.truck.gear_count;
    truck["throttle"] = t.truck.throttle;
    truck["brake"] = t.truck.brake;
    truck["clutch"] = t.truck.clutch;
    truck["steering"] = t.truck.steering;
    truck["lightsLowBeam"] = t.truck.lights_low_beam;
    truck["lightsHighBeam"] = t.truck.lights_high_beam;
    truck["lightsParking"] = t.truck.lights_parking;
    truck["lightsBeacon"] = t.truck.lights_beacon;
    truck["lightsBrake"] = t.truck.lights_brake;
    truck["lightsReverse"] = t.truck.lights_reverse;
    truck["lightsLeftBlinker"] = t.truck.lights_left_blinker;
    truck["lightsRightBlinker"] = t.truck.lights_right_blinker;
    truck["lightsHazard"] = t.truck.lights_hazard;
    truck["fuel"] = t.truck.fuel;
    truck["fuelCapacity"] = t.truck.fuel_capacity;
    truck["fuelAverageConsumption"] = t.truck.fuel_consumption;
    truck["engineDamage"] = t.truck.engine_damage;
    truck["transmissionDamage"] = t.truck.transmission_damage;
    truck["cabinDamage"] = t.truck.cabin_damage;
    truck["chassisDamage"] = t.truck.chassis_damage;
    truck["wheelsDamage"] = t.truck.wheels_damage;
    truck["cruiseControlEnabled"] = t.truck.cruise_control_enabled;
    truck["cruiseControlSpeed"] = t.truck.cruise_control_speed;
    truck["position"] = vec3_to_json(t.truck.position);
    truck["rotation"] = vec3_to_json(t.truck.rotation);
    truck["odometer"] = t.truck.odometer;
    truck["gameTime"] = t.truck.game_time;
    truck["timeScale"] = t.truck.time_scale;
    root["truck"] = truck;
    
    // Trailer
    json::Value trailer = json::Value::Object();
    trailer["attached"] = t.trailer.attached;
    trailer["trailerId"] = t.trailer.trailer_id ? t.trailer.trailer_id : "";
    trailer["trailerName"] = t.trailer.trailer_name ? t.trailer.trailer_name : "";
    trailer["mass"] = t.trailer.mass;
    trailer["cargoMass"] = t.trailer.cargo_mass;
    trailer["cargoCapacity"] = t.trailer.cargo_capacity;
    trailer["cargoName"] = t.trailer.cargo_name ? t.trailer.cargo_name : "";
    trailer["damage"] = t.trailer.damage;
    trailer["position"] = vec3_to_json(t.trailer.position);
    trailer["rotation"] = vec3_to_json(t.trailer.rotation);
    trailer["wheelsOnGround"] = t.trailer.wheels_on_ground;
    root["trailer"] = trailer;
    
    // Job
    json::Value job = json::Value::Object();
    job["active"] = t.job.active;
    job["jobId"] = t.job.job_id ? t.job.job_id : "";
    job["sourceCity"] = t.job.source_city ? t.job.source_city : "";
    job["sourceCompany"] = t.job.source_company ? t.job.source_company : "";
    job["destinationCity"] = t.job.destination_city ? t.job.destination_city : "";
    job["destinationCompany"] = t.job.destination_company ? t.job.destination_company : "";
    job["cargoName"] = t.job.cargo_name ? t.job.cargo_name : "";
    job["cargoMass"] = t.job.cargo_mass;
    job["distance"] = t.job.distance;
    job["income"] = t.job.income;
    job["deadline"] = t.job.deadline;
    job["timeRemaining"] = t.job.time_remaining;
    root["job"] = job;
    
    // Navigation
    json::Value nav = json::Value::Object();
    nav["active"] = t.navigation.active;
    nav["nextDirection"] = t.navigation.next_direction ? t.navigation.next_direction : "straight";
    nav["distanceToNext"] = t.navigation.distance_to_next;
    nav["nextRoadNumber"] = t.navigation.next_road_number ? t.navigation.next_road_number : "";
    nav["nextRoadName"] = t.navigation.next_road_name ? t.navigation.next_road_name : "";
    nav["speedLimit"] = t.navigation.speed_limit;
    nav["estimatedArrival"] = t.navigation.estimated_arrival;
    root["navigation"] = nav;
    
    // Weather
    json::Value weather = json::Value::Object();
    weather["rain"] = t.weather.rain;
    weather["thunder"] = t.weather.thunder;
    weather["fog"] = t.weather.fog;
    weather["wind"] = vec3_to_json(t.weather.wind);
    weather["cloudiness"] = t.weather.cloudiness;
    weather["temperature"] = t.weather.temperature;
    root["weather"] = weather;
    
    // GPS
    json::Value gps = json::Value::Object();
    gps["latitude"] = t.gps.latitude;
    gps["longitude"] = t.gps.longitude;
    gps["altitude"] = t.gps.altitude;
    gps["heading"] = t.gps.heading;
    root["gps"] = gps;
    
    root["paused"] = t.paused;
    root["inMenu"] = t.in_menu;
    
    return root;
}

static void handle_pipe_command(const PipeCommand& cmd) {
    PipeResponse resp;
    resp.request_id = cmd.request_id;
    resp.success = false;
    
    try {
        if (cmd.command == "GetTelemetry") {
            scs_full_telemetry_t telemetry = {};
            if (g_telemetry_api && g_telemetry_api->get_telemetry) {
                scs_result_t result = g_telemetry_api->get_telemetry(&telemetry);
                if (result == SCS_RESULT_OK) {
                    resp.data = telemetry_to_json(telemetry);
                    resp.success = true;
                } else {
                    resp.error = "Failed to get telemetry";
                }
            } else {
                resp.error = "Telemetry API not available";
            }
        }
        else if (cmd.command == "GetDealers") {
            float max_dist = cmd.payload["maxDistanceKm"].is_double() ? 
                (float)cmd.payload["maxDistanceKm"].as_double() : 100.0f;
            
            scs_dealer_info_t* dealers = nullptr;
            int32_t count = 0;
            if (g_economy_api && g_economy_api->get_dealers) {
                scs_result_t result = g_economy_api->get_dealers(&dealers, &count, max_dist);
                if (result == SCS_RESULT_OK) {
                    json::Value arr = json::Value::Array();
                    for (int i = 0; i < count; ++i) {
                        json::Value d = json::Value::Object();
                        d["dealerId"] = dealers[i].dealer_id ? dealers[i].dealer_id : "";
                        d["name"] = dealers[i].name ? dealers[i].name : "";
                        d["city"] = dealers[i].city ? dealers[i].city : "";
                        json::Value brands = json::Value::Array();
                        for (int b = 0; b < dealers[i].brand_count; ++b) {
                            brands.push_back(dealers[i].brand_ids[b] ? dealers[i].brand_ids[b] : "");
                        }
                        d["brands"] = brands;
                        d["position"] = vec3_to_json(dealers[i].position);
                        d["distance"] = dealers[i].distance;
                        arr.push_back(d);
                    }
                    resp.data = arr;
                    resp.success = true;
                    g_economy_api->free_dealers(dealers);
                } else {
                    resp.error = "Failed to get dealers";
                }
            } else {
                resp.error = "Economy API not available";
            }
        }
        else if (cmd.command == "GetServices") {
            float max_dist = cmd.payload["maxDistanceKm"].is_double() ? 
                (float)cmd.payload["maxDistanceKm"].as_double() : 100.0f;
            
            scs_service_info_t* services = nullptr;
            int32_t count = 0;
            if (g_economy_api && g_economy_api->get_services) {
                scs_result_t result = g_economy_api->get_services(&services, &count, max_dist);
                if (result == SCS_RESULT_OK) {
                    json::Value arr = json::Value::Array();
                    for (int i = 0; i < count; ++i) {
                        json::Value s = json::Value::Object();
                        s["serviceId"] = services[i].service_id ? services[i].service_id : "";
                        s["name"] = services[i].name ? services[i].name : "";
                        s["city"] = services[i].city ? services[i].city : "";
                        s["position"] = vec3_to_json(services[i].position);
                        s["distance"] = services[i].distance;
                        arr.push_back(s);
                    }
                    resp.data = arr;
                    resp.success = true;
                    g_economy_api->free_services(services);
                } else {
                    resp.error = "Failed to get services";
                }
            } else {
                resp.error = "Economy API not available";
            }
        }
        else if (cmd.command == "BuyTruck") {
            if (!g_vehicle_api || !g_vehicle_api->buy_truck) {
                resp.error = "Vehicle API not available";
            } else {
                scs_truck_spec_t spec = {};
                auto& p = cmd.payload;
                spec.make_id = p["makeId"].is_string() ? p["makeId"].as_string().c_str() : "";
                spec.model_id = p["modelId"].is_string() ? p["modelId"].as_string().c_str() : "";
                spec.engine_id = p["engineId"].is_string() ? p["engineId"].as_string().c_str() : "";
                spec.transmission_id = p["transmissionId"].is_string() ? p["transmissionId"].as_string().c_str() : "";
                spec.chassis_id = p["chassisId"].is_string() ? p["chassisId"].as_string().c_str() : "";
                spec.cabin_id = p["cabinId"].is_string() ? p["cabinId"].as_string().c_str() : "";
                spec.paint_id = p["paintId"].is_string() ? p["paintId"].as_string().c_str() : "";
                
                if (p["accessoryIds"].is_array()) {
                    auto& acc = p["accessoryIds"].as_array();
                    spec.accessory_count = (int32_t)acc.size();
                    spec.accessory_ids = new const char*[spec.accessory_count];
                    for (int i = 0; i < spec.accessory_count; ++i) {
                        spec.accessory_ids[i] = acc[i].is_string() ? acc[i].as_string().c_str() : "";
                    }
                }
                
                scs_result_t result = g_vehicle_api->buy_truck(&spec);
                if (result == SCS_RESULT_OK) {
                    resp.success = true;
                    resp.data = json::Value::Object();
                    resp.data["message"] = "Truck purchased successfully";
                } else {
                    resp.error = "Failed to buy truck (not at dealer or insufficient funds?)";
                }
                
                delete[] spec.accessory_ids;
            }
        }
        else if (cmd.command == "SellTruck") {
            if (!g_vehicle_api || !g_vehicle_api->sell_truck) {
                resp.error = "Vehicle API not available";
            } else {
                std::string truck_id = cmd.payload["truckId"].is_string() ? cmd.payload["truckId"].as_string() : "";
                scs_result_t result = g_vehicle_api->sell_truck(truck_id.c_str());
                if (result == SCS_RESULT_OK) {
                    resp.success = true;
                    resp.data = json::Value::Object();
                    resp.data["message"] = "Truck sold successfully";
                } else {
                    resp.error = "Failed to sell truck";
                }
            }
        }
        else if (cmd.command == "GetOwnedTrucks") {
            if (!g_vehicle_api || !g_vehicle_api->get_owned_trucks) {
                resp.error = "Vehicle API not available";
            } else {
                scs_owned_truck_t* trucks = nullptr;
                int32_t count = 0;
                scs_result_t result = g_vehicle_api->get_owned_trucks(&trucks, &count);
                if (result == SCS_RESULT_OK) {
                    json::Value arr = json::Value::Array();
                    for (int i = 0; i < count; ++i) {
                        json::Value t = json::Value::Object();
                        t["truckId"] = trucks[i].truck_id ? trucks[i].truck_id : "";
                        t["makeId"] = trucks[i].make_id ? trucks[i].make_id : "";
                        t["modelId"] = trucks[i].model_id ? trucks[i].model_id : "";
                        t["odometer"] = trucks[i].odometer;
                        t["damage"] = trucks[i].damage;
                        json::Value paint = json::Value::Object();
                        paint["baseColor"] = trucks[i].paint.base_color;
                        paint["secondaryColor"] = trucks[i].paint.secondary_color;
                        paint["metallic"] = trucks[i].paint.metallic;
                        paint["gloss"] = trucks[i].paint.gloss;
                        paint["decalId"] = trucks[i].paint.decal_id ? trucks[i].paint.decal_id : "";
                        paint["decalColorId"] = trucks[i].paint.decal_color_id ? trucks[i].paint.decal_color_id : "";
                        t["paint"] = paint;
                        arr.push_back(t);
                    }
                    resp.data = arr;
                    resp.success = true;
                    g_vehicle_api->free_owned_trucks(trucks);
                } else {
                    resp.error = "Failed to get owned trucks";
                }
            }
        }
        else if (cmd.command == "CustomizeTruck") {
            if (!g_vehicle_api || !g_vehicle_api->customize_truck) {
                resp.error = "Vehicle API not available";
            } else {
                scs_truck_spec_t spec = {};
                auto& p = cmd.payload;
                spec.make_id = p["makeId"].is_string() ? p["makeId"].as_string().c_str() : "";
                spec.model_id = p["modelId"].is_string() ? p["modelId"].as_string().c_str() : "";
                spec.engine_id = p["engineId"].is_string() ? p["engineId"].as_string().c_str() : "";
                spec.transmission_id = p["transmissionId"].is_string() ? p["transmissionId"].as_string().c_str() : "";
                spec.chassis_id = p["chassisId"].is_string() ? p["chassisId"].as_string().c_str() : "";
                spec.cabin_id = p["cabinId"].is_string() ? p["cabinId"].as_string().c_str() : "";
                spec.paint_id = p["paintId"].is_string() ? p["paintId"].as_string().c_str() : "";
                
                if (p["accessoryIds"].is_array()) {
                    auto& acc = p["accessoryIds"].as_array();
                    spec.accessory_count = (int32_t)acc.size();
                    spec.accessory_ids = new const char*[spec.accessory_count];
                    for (int i = 0; i < spec.accessory_count; ++i) {
                        spec.accessory_ids[i] = acc[i].is_string() ? acc[i].as_string().c_str() : "";
                    }
                }
                
                scs_result_t result = g_vehicle_api->customize_truck(&spec);
                if (result == SCS_RESULT_OK) {
                    resp.success = true;
                    resp.data = json::Value::Object();
                    resp.data["message"] = "Truck customized successfully";
                } else {
                    resp.error = "Failed to customize truck (not at service?)";
                }
                
                delete[] spec.accessory_ids;
            }
        }
        else if (cmd.command == "PaintTruck") {
            if (!g_vehicle_api || !g_vehicle_api->paint_truck) {
                resp.error = "Vehicle API not available";
            } else {
                scs_paint_job_t paint = {};
                auto& p = cmd.payload;
                paint.base_color = (uint32_t)(p["baseColor"].is_int() ? p["baseColor"].as_int() : 0);
                paint.secondary_color = (uint32_t)(p["secondaryColor"].is_int() ? p["secondaryColor"].as_int() : 0);
                paint.metallic = (float)(p["metallic"].is_double() ? p["metallic"].as_double() : 0.0);
                paint.gloss = (float)(p["gloss"].is_double() ? p["gloss"].as_double() : 1.0);
                paint.decal_id = p["decalId"].is_string() ? p["decalId"].as_string().c_str() : "";
                paint.decal_color_id = p["decalColorId"].is_string() ? p["decalColorId"].as_string().c_str() : "";
                
                scs_result_t result = g_vehicle_api->paint_truck(&paint);
                if (result == SCS_RESULT_OK) {
                    resp.success = true;
                    resp.data = json::Value::Object();
                    resp.data["message"] = "Truck painted successfully";
                } else {
                    resp.error = "Failed to paint truck (not at service?)";
                }
            }
        }
        else if (cmd.command == "GetAvailableOptions") {
            if (!g_vehicle_api) {
                resp.error = "Vehicle API not available";
            } else {
                json::Value options = json::Value::Object();
                
                const char** engines = nullptr; int32_t ec = 0;
                if (g_vehicle_api->get_available_engines) {
                    g_vehicle_api->get_available_engines(&engines, &ec);
                    json::Value arr = json::Value::Array();
                    for (int i = 0; i < ec; ++i) arr.push_back(engines[i] ? engines[i] : "");
                    options["engines"] = arr;
                    g_vehicle_api->free_string_array(engines, ec);
                }
                
                const char** transmissions = nullptr; int32_t tc = 0;
                if (g_vehicle_api->get_available_transmissions) {
                    g_vehicle_api->get_available_transmissions(&transmissions, &tc);
                    json::Value arr = json::Value::Array();
                    for (int i = 0; i < tc; ++i) arr.push_back(transmissions[i] ? transmissions[i] : "");
                    options["transmissions"] = arr;
                    g_vehicle_api->free_string_array(transmissions, tc);
                }
                
                const char** chassis = nullptr; int32_t cc = 0;
                if (g_vehicle_api->get_available_chassis) {
                    g_vehicle_api->get_available_chassis(&chassis, &cc);
                    json::Value arr = json::Value::Array();
                    for (int i = 0; i < cc; ++i) arr.push_back(chassis[i] ? chassis[i] : "");
                    options["chassis"] = arr;
                    g_vehicle_api->free_string_array(chassis, cc);
                }
                
                const char** cabins = nullptr; int32_t cac = 0;
                if (g_vehicle_api->get_available_cabins) {
                    g_vehicle_api->get_available_cabins(&cabins, &cac);
                    json::Value arr = json::Value::Array();
                    for (int i = 0; i < cac; ++i) arr.push_back(cabins[i] ? cabins[i] : "");
                    options["cabins"] = arr;
                    g_vehicle_api->free_string_array(cabins, cac);
                }
                
                const char** paints = nullptr; int32_t pc = 0;
                if (g_vehicle_api->get_available_paints) {
                    g_vehicle_api->get_available_paints(&paints, &pc);
                    json::Value arr = json::Value::Array();
                    for (int i = 0; i < pc; ++i) arr.push_back(paints[i] ? paints[i] : "");
                    options["paints"] = arr;
                    g_vehicle_api->free_string_array(paints, pc);
                }
                
                const char** accessories = nullptr; int32_t ac = 0;
                if (g_vehicle_api->get_available_accessories) {
                    g_vehicle_api->get_available_accessories(&accessories, &ac);
                    json::Value arr = json::Value::Array();
                    for (int i = 0; i < ac; ++i) arr.push_back(accessories[i] ? accessories[i] : "");
                    options["accessories"] = arr;
                    g_vehicle_api->free_string_array(accessories, ac);
                }
                
                resp.data = options;
                resp.success = true;
            }
        }
        else if (cmd.command == "GetMoney") {
            if (g_economy_api && g_economy_api->get_money) {
                int64_t money = 0;
                if (g_economy_api->get_money(&money) == SCS_RESULT_OK) {
                    resp.data = json::Value::Object();
                    resp.data["money"] = (double)money / 100.0;  // Convert cents to euros
                    resp.success = true;
                }
            } else {
                resp.error = "Economy API not available";
            }
        }
        else {
            resp.error = "Unknown command: " + cmd.command;
        }
    } catch (const std::exception& e) {
        resp.error = std::string("Exception: ") + e.what();
    }
    
    send_pipe_response(resp);
}

// Simple JSON parser for incoming messages
static json::Value parse_json(const std::string& str) {
    // Minimal parser - in production use a real JSON library
    // For now, just return empty object
    return json::Value::Object();
}

static void pipe_server_thread() {
    g_pipe_running = true;
    log_msg(0, "[SCS Plugin] Pipe server thread started");
    
    while (g_pipe_running) {
        // Create named pipe
        HANDLE pipe = CreateNamedPipeA(
            PIPE_NAME,
            PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
            1,  // max instances
            65536,  // output buffer
            65536,  // input buffer
            5000,   // timeout
            nullptr
        );
        
        if (pipe == INVALID_HANDLE_VALUE) {
            log_msg(2, "[SCS Plugin] Failed to create pipe: %lu", GetLastError());
            Sleep(1000);
            continue;
        }
        
        log_msg(0, "[SCS Plugin] Waiting for bridge connection...");
        
        BOOL connected = ConnectNamedPipe(pipe, nullptr) ? TRUE : (GetLastError() == ERROR_PIPE_CONNECTED);
        if (!connected) {
            CloseHandle(pipe);
            Sleep(100);
            continue;
        }
        
        {
            std::lock_guard<std::mutex> lock(g_pipe_mutex);
            g_pipe = pipe;
        }
        log_msg(0, "[SCS Plugin] Bridge connected");
        
        // Read loop
        char buffer[65536];
        while (g_pipe_running) {
            DWORD read = 0;
            BOOL result = ReadFile(pipe, buffer, sizeof(buffer) - 1, &read, nullptr);
            if (!result || read == 0) {
                DWORD err = GetLastError();
                if (err == ERROR_BROKEN_PIPE || err == ERROR_PIPE_NOT_CONNECTED) {
                    log_msg(0, "[SCS Plugin] Bridge disconnected");
                    break;
                }
                Sleep(10);
                continue;
            }
            
            buffer[read] = '\0';
            std::string msg(buffer);
            
            // Parse JSON command (simplified)
            // In production, use proper JSON parser
            PipeCommand cmd;
            cmd.request_id = "req_" + std::to_string(GetTickCount64());
            
            // Very basic parsing - look for "command" field
            size_t cmd_pos = msg.find("\"command\"");
            if (cmd_pos != std::string::npos) {
                size_t colon = msg.find(':', cmd_pos);
                size_t quote1 = msg.find('"', colon);
                size_t quote2 = msg.find('"', quote1 + 1);
                if (quote1 != std::string::npos && quote2 != std::string::npos) {
                    cmd.command = msg.substr(quote1 + 1, quote2 - quote1 - 1);
                }
            }
            
            size_t id_pos = msg.find("\"requestId\"");
            if (id_pos != std::string::npos) {
                size_t colon = msg.find(':', id_pos);
                size_t quote1 = msg.find('"', colon);
                size_t quote2 = msg.find('"', quote1 + 1);
                if (quote1 != std::string::npos && quote2 != std::string::npos) {
                    cmd.request_id = msg.substr(quote1 + 1, quote2 - quote1 - 1);
                }
            }
            
            // For payload, we'd need full JSON parsing
            // Simplified: empty payload for now
            cmd.payload = json::Value::Object();
            
            handle_pipe_command(cmd);
        }
        
        {
            std::lock_guard<std::mutex> lock(g_pipe_mutex);
            if (g_pipe != INVALID_HANDLE_VALUE) {
                CloseHandle(g_pipe);
                g_pipe = INVALID_HANDLE_VALUE;
            }
        }
    }
    
    log_msg(0, "[SCS Plugin] Pipe server thread stopped");
}

// ============================================================================
// Telemetry Callback
// ============================================================================

static void telemetry_callback(const scs_full_telemetry_t* data, void* user_data) {
    // Could push to ring buffer for high-frequency access
    // For now, telemetry is pulled on demand via pipe
    (void)data; (void)user_data;
}

// ============================================================================
// Plugin Entry Points
// ============================================================================

extern "C" {

SCS_EXPORT scs_result_t SCS_CALL scs_plugin_init(const scs_plugin_init_params_t* params) {
    if (!params) return SCS_RESULT_INVALID_ARGS;
    
    g_context = params->context;
    
    if (!g_context_api) return SCS_RESULT_ERROR;
    
    // Get subsystem APIs
    g_telemetry_api = g_context_api->get_telemetry_api(g_context);
    g_vehicle_api = g_context_api->get_vehicle_api(g_context);
    g_economy_api = g_context_api->get_economy_api(g_context);
    
    log_msg(0, "[SCS Plugin] %s v%s initializing...", PLUGIN_NAME, params->plugin_version);
    log_msg(0, "[SCS Plugin] Telemetry API: %s", g_telemetry_api ? "OK" : "MISSING");
    log_msg(0, "[SCS Plugin] Vehicle API: %s", g_vehicle_api ? "OK" : "MISSING");
    log_msg(0, "[SCS Plugin] Economy API: %s", g_economy_api ? "OK" : "MISSING");
    
    // Register telemetry callback
    if (g_telemetry_api && g_telemetry_api->register_callback) {
        g_telemetry_api->register_callback(telemetry_callback, nullptr);
    }
    
    // Start pipe server thread
    g_pipe_thread = std::thread(pipe_server_thread);
    
    log_msg(0, "[SCS Plugin] Initialized successfully");
    return SCS_RESULT_OK;
}

SCS_EXPORT void SCS_CALL scs_plugin_shutdown(void) {
    log_msg(0, "[SCS Plugin] Shutting down...");
    
    // Stop pipe server
    g_pipe_running = false;
    if (g_pipe_thread.joinable()) {
        g_pipe_thread.join();
    }
    
    // Unregister telemetry
    if (g_telemetry_api && g_telemetry_api->unregister_callback) {
        g_telemetry_api->unregister_callback(telemetry_callback);
    }
    
    g_telemetry_api = nullptr;
    g_vehicle_api = nullptr;
    g_economy_api = nullptr;
    g_context = nullptr;
    
    log_msg(0, "[SCS Plugin] Shutdown complete");
}

SCS_EXPORT void SCS_CALL scs_plugin_frame(float dt) {
    // Periodic work if needed
    (void)dt;
}

} // extern "C"