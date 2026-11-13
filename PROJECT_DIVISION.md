# Stratos CloudSim: Project Architecture & Team Division

This document outlines the architectural division of the **Cloud Resource Allocation Simulator** across 4 team members, detailing each member's core focus, owned files, deliverables, and specific **Object-Oriented Programming (OOP)** contributions.

---

## 1. Team Division & OOP Responsibilities

| Team Member & Role | Core Focus Area | Files Owned | Key Deliverables & OOP Responsibilities |
| :--- | :--- | :--- | :--- |
| **Member 1: Core Domain Architect**<br>*(Object-Oriented Modeling & Node Hierarchy)* | Domain Models & OOP Abstractions | `core-engine/include/Resource.hpp`<br>`core-engine/include/ComputeNode.hpp`<br>`core-engine/include/Task.hpp` | • **Abstract Base Classes**: Designed abstract `Resource`, `ComputeNode`, and `Task` as foundational blueprints.<br>• **Inheritance & Subclassing**: Extended them into concrete classes (`CPUResource`, `MemoryResource`, `PhysicalServer`, `VirtualMachine`, and Task subclasses `BatchTask`, `InteractiveTask`, `PriorityTask`).<br>• **Encapsulation & Invariants**: Enforced data boundaries with guarded mutators (`allocate`, `release`, `assignTask`, `freeResources`) and state machine transitions (`waiting` $\rightarrow$ `running` $\rightarrow$ `completed`).<br>• **Polymorphism**: Overrode dynamic billing formulas between fixed-cost physical nodes vs. elasticity-scaled VMs. |
| **Member 2: Algorithms & Simulation Architect**<br>*(Scheduling Strategies & Cluster State)* | Scheduling Policies & Cluster Management | `core-engine/include/SchedulingStrategy.hpp`<br>`core-engine/include/ResourceManager.hpp` | • **Strategy Pattern (`interface`)**: Defined the `SchedulingStrategy` contract and implemented 4 interchangeable concrete policies: `RoundRobinScheduler`, `PriorityScheduler`, `LeastLoadedScheduler`, and `CostAwareScheduler`.<br>• **Factory Method Pattern**: Implemented `createScheduler(id)` to encapsulate strategy instantiation without exposing concrete classes.<br>• **Object Aggregation**: Built `ResourceManager` as a domain aggregate holding and orchestrating collections of `ComputeNode` instances.<br>• **Encapsulated Queue State**: Designed internal queue buffers to encapsulate task ordering and thread-safe batch removal. |
| **Member 3: Data & Evaluation Engine Specialist**<br>*(Benchmarking, Scoring & CSV Pipeline)* | Evaluation Engine, Ingestion & Metrics | `core-engine/include/StrategyEvaluator.hpp`<br>`core-engine/src/main.cpp`<br>`src/engine/CsvTaskParser.ts`<br>`src/domain/__tests__/Simulator.test.ts` | • **Static Service Abstraction**: Authored `StrategyEvaluator` as a specialized simulation coordinator providing deterministic head-to-head benchmarking.<br>• **Deep Cloning & State Isolation**: Instantiated separate cluster environments for each algorithm, ensuring zero cross-simulation mutation leaks during runs.<br>• **Multi-Objective Scoring**: Implemented mathematical normalization and goal-based weighting (`Balanced`, `Lowest Cost`, `Lowest Wait`, `Priority SLA`).<br>• **Factory Ingestion & Verification**: Implemented task deserialization in `CsvTaskParser.ts` mapping raw CSV rows to typed domain objects, and wrote unit test suites verifying class behaviors. |
| **Member 4: Full-Stack Frontend & UI/UX Engineer**<br>*(Dashboard, Visual Replay & State Binding)* | Minimal UI, Replay Engine & Visual Telemetry | `src/components/CompareStrategiesTab.tsx`<br>`src/components/WorkloadPlaybackPanel.tsx`<br>`core-engine/src/wasm_bindings.cpp`<br>`src/wasmBridge.ts`<br>`src/components/MetricsPanel.tsx`<br>`src/components/NodeClusterPanel.tsx`<br>`src/components/TaskQueuePanel.tsx` | • **Observer Pattern**: Designed playback state integration in `WorkloadPlaybackPanel.tsx` bound to the C++ WebAssembly engine.<br>• **WebAssembly Bridge**: Built `wasmBridge.ts` with asynchronous bindings to call into the compiled C++ engine from React.<br>• **Composition over Inheritance in UI**: Decomposed the dashboard into modular, reusable view components receiving strongly typed domain snapshot interfaces.<br>• **Visual Control Integration**: Linked class-based playback methods (`start`, `pause`, `step`, `setSpeed`) directly to interactive UI controls and live SVG visualizations. |

---

## 2. Technical Explanation of the 4 Scheduling Strategies

### 1. Round Robin (`RoundRobinScheduler`)
* **How It Works**:
  Maintains a rotating pointer (`nextIndex`) across the cluster. When tasks arrive, the scheduler iterates through nodes sequentially (`(index + 1) % N`). If a node has enough available CPU and memory for the task, it assigns it and advances the pointer; otherwise, it tests the subsequent node.
* **Key Strength**:
  Ensures fairness and eliminates starvation. Avoids biased clustering on any single node.
* **When It Wins**:
  Homogeneous workloads with uniform resource requirements arriving at a steady pace (e.g., `datasets/04_round_robin_optimal_1000.csv`).
* **Limitation**:
  Hardware-blind and cost-blind. It may assign a tiny task to an expensive BareMetal server or a huge task to a small VM.

---

### 2. Priority Queue (`PriorityScheduler`)
* **How It Works**:
  Inspects the queue of waiting tasks and sorts them before dispatch:
  1. Priority Level (`Priority = 3` > `Interactive = 2` > `Batch = 1`).
  2. Arrival Time (FIFO tie-breaker for identical priorities).
  It then allocates resources to the highest-priority tasks first into the first available node with sufficient capacity.
* **Key Strength**:
  Strict SLA enforcement for mission-critical and latency-sensitive workloads.
* **When It Wins**:
  High-contention scenarios with heavy background batch work and intermittent high-priority tasks (e.g., `datasets/01_priority_optimal_1000.csv`, where priority wait time dropped from **17,500 ms** down to **295 ms**).
* **Limitation**:
  Can cause starvation for low-priority `Batch` tasks if priority tasks continuously arrive.

---

### 3. Least Loaded (`LeastLoadedScheduler`)
* **How It Works**:
  At each scheduling pass, it evaluates the real-time CPU utilization (`getUtilization()`) across all eligible nodes in the cluster. It assigns the incoming task to the node that currently has the **lowest CPU utilization percentage** (factoring in tasks already dispatched in the same tick).
* **Key Strength**:
  Prevents hotspots and maximizes cluster headroom. Distributes utilization evenly across BareMetal servers and VMs.
* **When It Wins**:
  Bursty, heterogeneous workloads where sudden large tasks would otherwise overwhelm a single node (e.g., `datasets/03_least_loaded_optimal_1000.csv`).
* **Limitation**:
  Slightly higher computational overhead per scheduling tick ($O(\text{Tasks} \times \text{Nodes})$). It may wake up idle nodes prematurely instead of consolidating work.

---

### 4. Cost-Aware (`CostAwareScheduler`)
* **How It Works**:
  Evaluates the current `costPerTick` of every node that has enough capacity to run the task. It sorts candidates by cost ascending and assigns the task to the **cheapest eligible node**.
  * Virtual Machines: Base rate **$0.28–$0.52/tick** (scales dynamically).
  * BareMetal Physical Servers: Fixed **$1.85/tick**.
  Tasks are packed into economical VMs first and only spill over into Physical Servers when the VMs are fully saturated.
* **Key Strength**:
  Direct cloud infrastructure expenditure minimization.
* **When It Wins**:
  Cost-sensitive, budget-constrained workloads with small-to-medium task footprints (e.g., `datasets/02_cost_aware_optimal_1000.csv`, achieving the lowest total spend across 1,000 tasks).
* **Limitation**:
  Can create resource bottlenecks on cheap VMs, potentially increasing task queue wait times.

---

## 3. Quick Presentation / Viva Speaking Points

* **Member 1 (Core Domain Architect)**:
  > *"I established the core domain model hierarchy. I used **abstract classes** and **inheritance** to build `Resource`, `ComputeNode`, and `Task`, and used **encapsulation** so resource capacities can never be over-allocated."*
* **Member 2 (Algorithms & Simulation Architect)**:
  > *"I applied the **Strategy Design Pattern** and **Factory Pattern** so our cluster can hot-swap between `RoundRobin`, `Priority`, `LeastLoaded`, and `CostAware` scheduling without changing any node or cluster logic."*
* **Member 3 (Data & Evaluation Engine Specialist)**:
  > *"I authored the evaluation and metrics system. I used **object encapsulation** and **deep state cloning** in `StrategyEvaluator` and `MetricsCollector` to run identical benchmark simulations across all 4 strategies without data corruption."*
* **Member 4 (Full-Stack Frontend & UI/UX Engineer)**:
  > *"I implemented the **Observer Pattern** in `WorkloadPlaybackEngine` to decouple simulation time and state from the React UI, allowing live 1,000-task replays to update UI components without blocking the main thread."*
