cmake_minimum_required(VERSION 3.20)
project(ETS2ScsPlugin LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Windows specific settings
if(WIN32)
    add_compile_definitions(WIN32_LEAN_AND_MEAN NOMINMAX _CRT_SECURE_NO_WARNINGS)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /MP /bigobj")
    # Disable some warnings that are noisy with SCS SDK
    add_compile_options(/wd4251 /wd4275 /wd4800 /wd4244 /wd4267 /wd4305 /wd4996)
endif()

# Output as DLL
set(CMAKE_WINDOWS_EXPORT_ALL_SYMBOLS ON)
set(BUILD_SHARED_LIBS ON)

# Plugin output name
set(PLUGIN_NAME "ets2_mcp_plugin")

# Include directories
target_include_directories(${PLUGIN_NAME} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# Find SCS SDK (assumed to be in include/scs-sdk)
# User can override with -DSCS_SDK_PATH=...
if(NOT DEFINED ENV{SCS_SDK_PATH} AND NOT SCS_SDK_PATH)
    set(SCS_SDK_PATH "${CMAKE_CURRENT_SOURCE_DIR}/include/scs-sdk" CACHE PATH "Path to SCS SDK headers")
endif()

include_directories(${SCS_SDK_PATH})

# Source files
file(GLOB_RECURSE PLUGIN_SOURCES "src/*.cpp" "src/*.c")

add_library(${PLUGIN_NAME} SHARED ${PLUGIN_SOURCES})

# Link libraries
target_link_libraries(${PLUGIN_NAME} PRIVATE
    ${CMAKE_DL_LIBS}
    ws2_32
    kernel32
    user32
    shell32
    ole32
    uuid
)

# Output to build directory
set_target_properties(${PLUGIN_NAME} PROPERTIES
    OUTPUT_NAME "${PLUGIN_NAME}"
    PREFIX ""
    SUFFIX ".dll"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)

# Install target (for packaging)
install(TARGETS ${PLUGIN_NAME}
    RUNTIME DESTINATION bin
)

# Custom target to copy to ETS2 plugins folder for testing
add_custom_target(copy_to_ets2
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_BINARY_DIR}/bin/${PLUGIN_NAME}.dll"
        "$ENV{ETS2_PATH}/bin/win_x64/plugins/${PLUGIN_NAME}.dll"
    COMMENT "Copying plugin to ETS2 plugins folder"
    DEPENDS ${PLUGIN_NAME}
)