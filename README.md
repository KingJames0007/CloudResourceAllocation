# Stratos CloudSim: Cloud Resource Allocation Simulator

A deterministic, high-performance Cloud Resource Allocation Simulator and Strategy Evaluation platform built with **TypeScript**, **React**, and **Tailwind CSS**. The core architecture strictly adheres to **Object-Oriented Programming (OOP)** domain modeling.

---

## 🚀 Key Features

1. **Strict OOP Domain Hierarchy**:
   - `Resource` $\rightarrow$ `CPUResource`, `MemoryResource`, `StorageResource`
   - `ComputeNode` $\rightarrow$ `PhysicalServer` (high static capacity, fixed cost) & `VirtualMachine` (elastic cost scaling)
   - `Task` $\rightarrow$ `BatchTask` (P1), `InteractiveTask` (P2), `PriorityTask` (P3)
2. **4 Interchangeable Scheduling Strategies (Strategy Pattern)**:
   - **Round Robin**: Fair cyclic allocation across nodes.
   - **Priority Queue**: Priority-based sorting with strict latency SLA enforcement.
   - **Least Loaded**: Dynamic load balancing to the node with lowest CPU utilization.
   - **Cost-Aware**: Cost minimization by prioritizing economical VMs over bare-metal servers.
3. **High-Scale CSV Workload Evaluation**:
   - Ingest custom CSV datasets containing **1,000+ tasks**.
   - Deterministic head-to-head benchmarking with multi-objective ranking (`Balanced`, `Lowest Cost`, `Lowest Wait`, `Priority SLA`).
4. **Interactive Visual Workload Replay**:
   - Replay real uploaded tasks step-by-step through the 6-node cluster.
   - Variable playback speeds (`1x`, `2x`, `5x`, `10x`), live SVG sparklines, queue telemetry, and individual node resource progress bars.
5. **Team Architecture Documentation**:
   - See [`PROJECT_DIVISION.md`](./PROJECT_DIVISION.md) for the 4-member team breakdown and OOP speaking points.

---

## 🏛️ Project Structure

```
CloudResourceAllocation/
├── core-engine/                # Native C++17 Object-Oriented Simulation Engine
│   ├── include/                # OOP Domain Blueprints (.hpp)
│   │   ├── Resource.hpp        # Abstract Resource base & hardware subclasses
│   │   ├── Task.hpp            # Abstract Task base & Batch/Interactive/Priority subclasses
│   │   ├── ComputeNode.hpp     # Abstract ComputeNode & Physical/VM subclasses
│   │   ├── SchedulingStrategy.hpp # Strategy Pattern & 4 algorithm implementations
│   │   ├── ResourceManager.hpp # Cluster aggregation & clock tick manager
│   │   └── StrategyEvaluator.hpp # Multi-objective evaluation & scoring pipeline
│   ├── src/
│   │   ├── main.cpp            # Standalone CLI benchmark entry point
│   │   └── wasm_bindings.cpp   # Emscripten Embind WebAssembly interface
│   └── CMakeLists.txt          # CMake build configuration
├── src/                        # Web Dashboard (React 19, TypeScript, Tailwind CSS)
│   ├── components/             # Minimal UI components (Compare view, Playback, Panels)
│   ├── wasm/                   # Compiled WebAssembly binary & JS glue
│   └── wasmBridge.ts           # Asynchronous WebAssembly bridge
├── datasets/                   # 1,000+ task evaluation CSV datasets
└── PROJECT_DIVISION.md         # Team roles, file ownership & OOP viva notes
```

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons
- **Bundler & Tooling**: Vite, Vitest
- **Architecture**: Object-Oriented Domain Driven Design (DDD) & Strategy Pattern

---

## 📦 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- `npm`

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/<your-username>/<your-repo-name>.git
cd CloudResourceAllocation

# Install dependencies
npm install

# Run the development server
npm run dev

# Run unit tests
npm test

# Build for production
npm run build
```

---

## 📊 Pre-Generated Benchmark Datasets

Located in [`datasets/`](./datasets/):
- `01_priority_optimal_1000.csv` (1,000 tasks - optimal for Priority Queue)
- `02_cost_aware_optimal_1000.csv` (1,000 tasks - optimal for Cost-Aware)
- `03_least_loaded_optimal_1000.csv` (1,000 tasks - optimal for Least Loaded)
- `04_round_robin_optimal_1000.csv` (1,000 tasks - optimal for Round Robin)
- `05_enterprise_mixed_1200.csv` (1,200 tasks - mixed enterprise workload)
