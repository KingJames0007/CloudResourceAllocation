cmake_minimum_required(VERSION 3.15)
project(StratosCloudSim LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(include)

add_executable(stratos_sim src/main.cpp)

if (MSVC)
    target_compile_options(stratos_sim PRIVATE /W4)
else()
    target_compile_options(stratos_sim PRIVATE -Wall -Wextra -Wpedantic)
endif()
