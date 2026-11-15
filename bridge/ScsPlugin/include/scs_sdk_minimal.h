/**
 * Minimal SCS SDK Header for ETS2/ATS Plugin Development
 * Based on public SCS SDK documentation and community reverse engineering
 * 
 * NOTE: For production, replace with official SCS SDK from SCS Software partner program
 * This header provides the minimal interface definitions needed for our plugin.
 */

#ifndef SCS_SDK_MINIMAL_H
#define SCS_SDK_MINIMAL_H

#include <stdint.h>
#include <stddef.h>

#ifdef _WIN32
    #define SCS_CALL __cdecl
    #define SCS_EXPORT __declspec(dllexport)
#else
    #define SCS_CALL
    #define SCS_EXPORT __attribute__((visibility("default")))
#endif

// ============================================================================
// Version & Core Types
// ============================================================================

#define SCS_SDK_VERSION_MAJOR 1
#define SCS_SDK_VERSION_MINOR 0

typedef int32_t scs_result_t;
#define SCS_RESULT_OK 0
#define SCS_RESULT_ERROR -1
#define SCS_RESULT_NOT_FOUND -2
#define SCS_RESULT_INVALID_ARGS -3
#define SCS_RESULT_NOT_SUPPORTED -4
#define SCS_RESULT_ALREADY_EXISTS -5

// Opaque handles
typedef struct scs_context_t* scs_context_t;
typedef struct scs_telemetry_t* scs_telemetry_t;
typedef struct scs_ui_t* scs_ui_t;
typedef struct scs_input_t* scs_input_t;
typedef struct scs_job_t* scs_job_t;
typedef struct scs_vehicle_t* scs_vehicle_t;
typedef struct scs_dealer_t* scs_dealer_t;
typedef struct scs_customization_t* scs_customization_t;

// ============================================================================
// Telemetry Structures
// ============================================================================

typedef struct scs_vec3_t {
    float x, y, z;
} scs_vec3_t;

typedef struct scs_truck_telemetry_t {
    // Identification
    const char* truck_id;
    const char* truck_make;
    const char* truck_model;
    
    // Physics
    float speed;              // m/s
    float engine_rpm;
    float engine_rpm_max;
    int32_t gear;             // -1=R, 0=N, 1+
    int32_t gear_count;
    
    // Controls
    float throttle;           // 0.0-1.0
    float brake;              // 0.0-1.0
    float clutch;             // 0.0-1.0
    float steering;           // -1.0 to 1.0
    
    // Lights
    bool lights_low_beam;
    bool lights_high_beam;
    bool lights_parking;
    bool lights_beacon;
    bool lights_brake;
    bool lights_reverse;
    bool lights_left_blinker;
    bool lights_right_blinker;
    bool lights_hazard;
    
    // Fuel & Damage
    float fuel;               // liters
    float fuel_capacity;      // liters
    float fuel_consumption;   // L/100km
    float engine_damage;
    float transmission_damage;
    float cabin_damage;
    float chassis_damage;
    float wheels_damage;
    
    // Cruise Control
    bool cruise_control_enabled;
    float cruise_control_speed; // km/h
    
    // Position & Time
    scs_vec3_t position;
    scs_vec3_t rotation;      // Euler angles
    float odometer;           // km
    float game_time;          // seconds
    float time_scale;
    
    // Status
    bool paused;
    bool in_menu;
} scs_truck_telemetry_t;

typedef struct scs_trailer_telemetry_t {
    bool attached;
    const char* trailer_id;
    const char* trailer_name;
    float mass;               // kg
    float cargo_mass;         // kg
    float cargo_capacity;     // kg
    const char* cargo_name;
    float damage;             // 0.0-1.0
    scs_vec3_t position;
    scs_vec3_t rotation;
    int32_t wheels_on_ground;
} scs_trailer_telemetry_t;

typedef struct scs_job_telemetry_t {
    bool active;
    const char* job_id;
    const char* source_city;
    const char* source_company;
    const char* destination_city;
    const char* destination_company;
    const char* cargo_name;
    float cargo_mass;         // kg
    float distance;           // km remaining
    float income;             // expected
    float deadline;           // game time
    float time_remaining;     // seconds
} scs_job_telemetry_t;

typedef struct scs_navigation_telemetry_t {
    bool active;
    const char* next_direction;    // "straight", "left", "right", "sharp_left", "sharp_right", "uturn"
    float distance_to_next;        // meters
    const char* next_road_number;
    const char* next_road_name;
    float speed_limit;             // km/h
    float estimated_arrival;       // game time
} scs_navigation_telemetry_t;

typedef struct scs_weather_telemetry_t {
    float rain;              // 0.0-1.0
    float thunder;           // 0.0-1.0
    float fog;               // 0.0-1.0
    scs_vec3_t wind;
    float cloudiness;        // 0.0-1.0
    float temperature;       // Celsius
} scs_weather_telemetry_t;

typedef struct scs_gps_telemetry_t {
    double latitude;
    double longitude;
    double altitude;
    float heading;           // degrees
} scs_gps_telemetry_t;

typedef struct scs_full_telemetry_t {
    scs_truck_telemetry_t truck;
    scs_trailer_telemetry_t trailer;
    scs_job_telemetry_t job;
    scs_navigation_telemetry_t navigation;
    scs_weather_telemetry_t weather;
    scs_gps_telemetry_t gps;
    bool paused;
    bool in_menu;
} scs_full_telemetry_t;

// ============================================================================
// Vehicle Customization Structures
// ============================================================================

typedef struct scs_truck_spec_t {
    const char* make_id;           // e.g., "scania", "volvo", "man", "daf", "iveco", "renault", "mercedes"
    const char* model_id;          // e.g., "scania_r_2016", "volvo_fh16_2012"
    const char* engine_id;         // e.g., "scania_dc16_730"
    const char* transmission_id;   // e.g., "grso_12_speed"
    const char* chassis_id;        // e.g., "6x4", "4x2", "8x4"
    const char* cabin_id;          // e.g., "scania_r_streamline"
    const char* paint_id;          // base paint
    const char** accessory_ids;    // array of accessory IDs
    int32_t accessory_count;
} scs_truck_spec_t;

typedef struct scs_paint_job_t {
    uint32_t base_color;           // RGB packed
    uint32_t secondary_color;      // RGB packed
    float metallic;                // 0.0-1.0
    float gloss;                   // 0.0-1.0
    const char* decal_id;          // decal/skin ID
    const char* decal_color_id;    // decal color variant
} scs_paint_job_t;

typedef struct scs_dealer_info_t {
    const char* dealer_id;
    const char* name;
    const char* city;
    const char* brand_ids[16];     // brands sold here
    int32_t brand_count;
    scs_vec3_t position;
    float distance;                // km from player
} scs_dealer_info_t;

typedef struct scs_service_info_t {
    const char* service_id;
    const char* name;
    const char* city;
    scs_vec3_t position;
    float distance;
} scs_service_info_t;

typedef struct scs_owned_truck_t {
    const char* truck_id;
    const char* make_id;
    const char* model_id;
    float odometer;
    float damage;                  // overall 0.0-1.0
    scs_paint_job_t paint;
} scs_owned_truck_t;

// ============================================================================
// Callback Types
// ============================================================================

typedef void (SCS_CALL* scs_telemetry_callback_t)(const scs_full_telemetry_t* data, void* user_data);
typedef void (SCS_CALL* scs_event_callback_t)(const char* event_name, const void* event_data, void* user_data);

// ============================================================================
// Plugin Interface (exported by plugin)
// ============================================================================

typedef struct scs_plugin_init_params_t {
    uint32_t sdk_version;          // SCS_SDK_VERSION_MAJOR * 100 + MINOR
    scs_context_t context;
    const char* plugin_name;
    const char* plugin_version;
} scs_plugin_init_params_t;

// Called by game when loading plugin
typedef scs_result_t (SCS_CALL* scs_plugin_init_t)(const scs_plugin_init_params_t* params);
typedef void (SCS_CALL* scs_plugin_shutdown_t)(void);

// Called periodically by game
typedef void (SCS_CALL* scs_plugin_frame_t)(float dt);

// ============================================================================
// Telemetry API (provided by game via context)
// ============================================================================

typedef struct scs_telemetry_api_t {
    // Register for telemetry updates
    scs_result_t (SCS_CALL* register_callback)(scs_telemetry_callback_t callback, void* user_data);
    scs_result_t (SCS_CALL* unregister_callback)(scs_telemetry_callback_t callback);
    
    // Get current snapshot (synchronous)
    scs_result_t (SCS_CALL* get_telemetry)(scs_full_telemetry_t* out_data);
    
    // Enable/disable specific channels
    scs_result_t (SCS_CALL* set_channel_enabled)(const char* channel, bool enabled);
} scs_telemetry_api_t;

// ============================================================================
// Vehicle API (provided by game via context)
// ============================================================================

typedef struct scs_vehicle_api_t {
    // Get current truck spec
    scs_result_t (SCS_CALL* get_current_truck_spec)(scs_truck_spec_t* out_spec);
    
    // Buy truck at current dealer (must be at dealer)
    scs_result_t (SCS_CALL* buy_truck)(const scs_truck_spec_t* spec);
    
    // Sell truck from garage
    scs_result_t (SCS_CALL* sell_truck)(const char* truck_id);
    
    // Get owned trucks
    scs_result_t (SCS_CALL* get_owned_trucks)(scs_owned_truck_t** out_trucks, int32_t* out_count);
    void (SCS_CALL* free_owned_trucks)(scs_owned_truck_t* trucks);
    
    // Customize current truck (must be at service)
    scs_result_t (SCS_CALL* customize_truck)(const scs_truck_spec_t* spec);
    
    // Paint current truck (must be at service)
    scs_result_t (SCS_CALL* paint_truck)(const scs_paint_job_t* paint);
    
    // Get available options for current truck
    scs_result_t (SCS_CALL* get_available_engines)(const char*** out_ids, int32_t* out_count);
    scs_result_t (SCS_CALL* get_available_transmissions)(const char*** out_ids, int32_t* out_count);
    scs_result_t (SCS_CALL* get_available_chassis)(const char*** out_ids, int32_t* out_count);
    scs_result_t (SCS_CALL* get_available_cabins)(const char*** out_ids, int32_t* out_count);
    scs_result_t (SCS_CALL* get_available_paints)(const char*** out_ids, int32_t* out_count);
    scs_result_t (SCS_CALL* get_available_accessories)(const char*** out_ids, int32_t* out_count);
    void (SCS_CALL* free_string_array)(const char** array, int32_t count);
} scs_vehicle_api_t;

// ============================================================================
// Economy/Map API (provided by game via context)
// ============================================================================

typedef struct scs_economy_api_t {
    // Get nearby dealers
    scs_result_t (SCS_CALL* get_dealers)(scs_dealer_info_t** out_dealers, int32_t* out_count, float max_distance_km);
    void (SCS_CALL* free_dealers)(scs_dealer_info_t* dealers);
    
    // Get nearby services
    scs_result_t (SCS_CALL* get_services)(scs_service_info_t** out_services, int32_t* out_count, float max_distance_km);
    void (SCS_CALL* free_services)(scs_service_info_t* services);
    
    // Get player money
    scs_result_t (SCS_CALL* get_money)(int64_t* out_money);  // in cents
    
    // Get player XP/level
    scs_result_t (SCS_CALL* get_xp)(int64_t* out_xp);
    scs_result_t (SCS_CALL* get_level)(int32_t* out_level);
} scs_economy_api_t;

// ============================================================================
// Context API (provided by game)
// ============================================================================

typedef struct scs_context_api_t {
    // Get subsystem APIs
    const scs_telemetry_api_t* (SCS_CALL* get_telemetry_api)(scs_context_t ctx);
    const scs_vehicle_api_t* (SCS_CALL* get_vehicle_api)(scs_context_t ctx);
    const scs_economy_api_t* (SCS_CALL* get_economy_api)(scs_context_t ctx);
    
    // Logging
    void (SCS_CALL* log)(scs_context_t ctx, int level, const char* format, ...);
    
    // Plugin configuration
    scs_result_t (SCS_CALL* get_config_string)(scs_context_t ctx, const char* key, char* out_value, size_t max_len);
    scs_result_t (SCS_CALL* set_config_string)(scs_context_t ctx, const char* key, const char* value);
    scs_result_t (SCS_CALL* get_config_int)(scs_context_t ctx, const char* key, int32_t* out_value);
    scs_result_t (SCS_CALL* set_config_int)(scs_context_t ctx, const char* key, int32_t value);
} scs_context_api_t;

// ============================================================================
// Plugin Exported Functions (game calls these)
// ============================================================================

#ifdef __cplusplus
extern "C" {
#endif

// Required: Plugin entry point
SCS_EXPORT scs_result_t SCS_CALL scs_plugin_init(const scs_plugin_init_params_t* params);
SCS_EXPORT void SCS_CALL scs_plugin_shutdown(void);
SCS_EXPORT void SCS_CALL scs_plugin_frame(float dt);

#ifdef __cplusplus
}
#endif

#endif // SCS_SDK_MINIMAL_H