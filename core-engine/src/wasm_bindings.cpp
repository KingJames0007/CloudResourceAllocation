#include "Resource.hpp"
#include "ComputeNode.hpp"
#include "Task.hpp"
#include "SchedulingStrategy.hpp"
#include "ResourceManager.hpp"
#include "StrategyEvaluator.hpp"

#include <emscripten/bind.h>
#include <sstream>

using namespace emscripten;
using namespace stratos;

// Global interactive playback engine running purely in C++
class PlaybackController {
private:
    std::vector<TaskSpec> taskSpecs;
    std::string strategyId;
    std::unique_ptr<SchedulingStrategy> strategy;
    ResourceManager rm;
    std::vector<std::shared_ptr<Task>> pending;
    size_t pendingIdx = 0;
    std::vector<std::shared_ptr<Task>> waiting;
    int currentTick = 0;
    int completedCount = 0;
    int lastAssignedCount = 0;
    double totalCost = 0.0;
    long long totalWaitTicks = 0;

public:
    PlaybackController() = default;

    void load(const std::string& csvContent, const std::string& stratId) {
        taskSpecs.clear();
        strategyId = stratId;
        strategy = createScheduler(stratId);
        rm.reset();
        pending.clear();
        pendingIdx = 0;
        waiting.clear();
        currentTick = 0;
        completedCount = 0;
        lastAssignedCount = 0;
        totalCost = 0.0;
        totalWaitTicks = 0;

        // Parse CSV
        std::stringstream ss(csvContent);
        std::string line;
        bool isHeader = true;

        while (std::getline(ss, line)) {
            if (line.empty() || line[0] == '#') continue;
            std::stringstream lineStream(line);
            std::string idStr, typeStr, cpuStr, memStr, execStr, arrStr;

            if (std::getline(lineStream, idStr, ',') &&
                std::getline(lineStream, typeStr, ',') &&
                std::getline(lineStream, cpuStr, ',') &&
                std::getline(lineStream, memStr, ',') &&
                std::getline(lineStream, execStr, ',') &&
                std::getline(lineStream, arrStr, ',')) {

                if (isHeader && (typeStr == "type" || cpuStr == "requiredCpu")) {
                    isHeader = false;
                    continue;
                }
                isHeader = false;

                TaskType type = TaskType::Batch;
                if (typeStr == "Priority" || typeStr == "3" || typeStr == "high") type = TaskType::Priority;
                else if (typeStr == "Interactive" || typeStr == "2" || typeStr == "medium") type = TaskType::Interactive;

                try {
                    taskSpecs.push_back({
                        idStr,
                        type,
                        std::stod(cpuStr),
                        std::stod(memStr),
                        std::stoi(execStr),
                        std::stoi(arrStr)
                    });
                } catch (...) {
                    continue;
                }
            }
        }

        for (const auto& s : taskSpecs) {
            if (s.type == TaskType::Priority) {
                pending.push_back(std::make_shared<PriorityTask>(s.id, s.requiredCpu, s.requiredMemory, s.executionTime, s.arrivalTime));
            } else if (s.type == TaskType::Interactive) {
                pending.push_back(std::make_shared<InteractiveTask>(s.id, s.requiredCpu, s.requiredMemory, s.executionTime, s.arrivalTime));
            } else {
                pending.push_back(std::make_shared<BatchTask>(s.id, s.requiredCpu, s.requiredMemory, s.executionTime, s.arrivalTime));
            }
        }

        std::sort(pending.begin(), pending.end(), [](const auto& a, const auto& b) {
            return a->getArrivalTime() < b->getArrivalTime();
        });
    }

    void reset() {
        if (!taskSpecs.empty()) {
            std::string strat = strategyId;
            pending.clear();
            pendingIdx = 0;
            waiting.clear();
            currentTick = 0;
            completedCount = 0;
            lastAssignedCount = 0;
            totalCost = 0.0;
            totalWaitTicks = 0;
            rm.reset();
            strategy = createScheduler(strat);

            for (const auto& s : taskSpecs) {
                if (s.type == TaskType::Priority) {
                    pending.push_back(std::make_shared<PriorityTask>(s.id, s.requiredCpu, s.requiredMemory, s.executionTime, s.arrivalTime));
                } else if (s.type == TaskType::Interactive) {
                    pending.push_back(std::make_shared<InteractiveTask>(s.id, s.requiredCpu, s.requiredMemory, s.executionTime, s.arrivalTime));
                } else {
                    pending.push_back(std::make_shared<BatchTask>(s.id, s.requiredCpu, s.requiredMemory, s.executionTime, s.arrivalTime));
                }
            }
        }
    }

    bool isFinished() const {
        return (pendingIdx >= pending.size() && waiting.empty() && rm.getTotalRunningTasks() == 0);
    }

    void tick() {
        if (isFinished()) return;

        while (pendingIdx < pending.size() && pending[pendingIdx]->getArrivalTime() <= currentTick) {
            waiting.push_back(pending[pendingIdx]);
            pendingIdx++;
        }

        auto tickResult = rm.tickAllNodes(currentTick);
        totalCost += tickResult.tickCost;
        completedCount += static_cast<int>(tickResult.completedTasks.size());

        for (const auto& t : tickResult.completedTasks) {
            totalWaitTicks += t->getWaitTimeTicks(currentTick);
        }

        const auto& nodes = rm.getNodes();
        bool hasCapacity = false;
        for (const auto& n : nodes) {
            if (n->getCpu().getAvailable() >= 1.0 && n->getMemory().getAvailable() >= 1.0) {
                hasCapacity = true; break;
            }
        }

        int assignedNow = 0;
        if (hasCapacity && !waiting.empty() && strategy) {
            auto assignments = strategy->schedule(waiting, nodes);
            std::vector<std::shared_ptr<Task>> unassigned;
            for (const auto& task : waiting) {
                bool assigned = false;
                for (const auto& asgn : assignments) {
                    if (asgn.task->getId() == task->getId()) {
                        if (asgn.node->assignTask(task, currentTick)) {
                            assigned = true;
                            assignedNow++;
                        }
                        break;
                    }
                }
                if (!assigned) unassigned.push_back(task);
            }
            waiting = std::move(unassigned);
        }
        lastAssignedCount = assignedNow;
        currentTick++;
    }

    std::string getSnapshotJson() const {
        std::stringstream out;
        int avgWaitMs = completedCount == 0 ? 0 : static_cast<int>((totalWaitTicks * 1000) / completedCount);

        out << "{"
            << "\"isFinished\":" << (isFinished() ? "true" : "false") << ","
            << "\"currentTick\":" << currentTick << ","
            << "\"strategyId\":\"" << strategyId << "\","
            << "\"strategyName\":\"" << (strategy ? strategy->getName() : "") << "\","
            << "\"totalTasks\":" << pending.size() << ","
            << "\"completedCount\":" << completedCount << ","
            << "\"lastAssignedCount\":" << lastAssignedCount << ","
            << "\"latestMetrics\":{"
            << "\"tick\":" << currentTick << ","
            << "\"cpuUtilization\":" << rm.getClusterCpuUtilization() << ","
            << "\"memoryUtilization\":" << rm.getClusterMemoryUtilization() << ","
            << "\"averageWaitTimeMs\":" << avgWaitMs << ","
            << "\"totalCost\":" << totalCost << ","
            << "\"tickCost\":0,"
            << "\"queuedCount\":" << waiting.size() << ","
            << "\"runningCount\":" << rm.getTotalRunningTasks() << ","
            << "\"completedCount\":" << completedCount
            << "},"
            << "\"queuedTasks\":[";

        size_t limit = std::min(waiting.size(), size_t(80));
        for (size_t i = 0; i < limit; ++i) {
            const auto& t = waiting[i];
            out << "{"
                << "\"id\":\"" << t->getId() << "\","
                << "\"type\":\"" << t->getTypeName() << "\","
                << "\"priority\":" << t->getPriority() << ","
                << "\"requiredCpu\":" << t->getRequiredCpu() << ","
                << "\"requiredMemory\":" << t->getRequiredMemory() << ","
                << "\"executionTime\":" << t->getExecutionTime() << ","
                << "\"remainingTime\":" << t->getRemainingTime() << ","
                << "\"arrivalTime\":" << t->getArrivalTime() << ","
                << "\"status\":\"waiting\","
                << "\"waitTicks\":" << t->getWaitTimeTicks(currentTick)
                << "}" << (i + 1 < limit ? "," : "");
        }

        out << "],\"nodes\":[";
        const auto& nodes = rm.getNodes();
        for (size_t i = 0; i < nodes.size(); ++i) {
            const auto& n = nodes[i];
            out << "{"
                << "\"id\":\"" << n->getId() << "\","
                << "\"name\":\"" << n->getName() << "\","
                << "\"nodeType\":\"" << n->getNodeTypeName() << "\","
                << "\"cpuAllocated\":" << n->getCpu().getAllocated() << ","
                << "\"cpuCapacity\":" << n->getCpu().getCapacity() << ","
                << "\"cpuUtilization\":" << n->getUtilization() << ","
                << "\"memoryAllocated\":" << n->getMemory().getAllocated() << ","
                << "\"memoryCapacity\":" << n->getMemory().getCapacity() << ","
                << "\"memoryUtilization\":" << n->getMemoryUtilization() << ","
                << "\"costPerTick\":" << n->getCostPerTick() << ","
                << "\"runningTasks\":[";

            const auto& running = n->getRunningTasks();
            for (size_t j = 0; j < running.size(); ++j) {
                const auto& rt = running[j];
                out << "{"
                    << "\"id\":\"" << rt->getId() << "\","
                    << "\"type\":\"" << rt->getTypeName() << "\","
                    << "\"remainingTime\":" << rt->getRemainingTime()
                    << "}" << (j + 1 < running.size() ? "," : "");
            }
            out << "]}" << (i + 1 < nodes.size() ? "," : "");
        }
        out << "]}";

        return out.str();
    }
};

static PlaybackController globalPlayback;

// Exported C++ functions
void loadPlaybackCsv(const std::string& csvContent, const std::string& strategyId) {
    globalPlayback.load(csvContent, strategyId);
}

void tickPlayback() {
    globalPlayback.tick();
}

void resetPlayback() {
    globalPlayback.reset();
}

std::string getPlaybackSnapshot() {
    return globalPlayback.getSnapshotJson();
}

std::string evaluateWorkloadJson(const std::string& csvContent, const std::string& goalStr) {
    std::vector<TaskSpec> tasks;
    std::stringstream ss(csvContent);
    std::string line;
    bool isHeader = true;

    while (std::getline(ss, line)) {
        if (line.empty() || line[0] == '#') continue;
        std::stringstream lineStream(line);
        std::string idStr, typeStr, cpuStr, memStr, execStr, arrStr;

        if (std::getline(lineStream, idStr, ',') &&
            std::getline(lineStream, typeStr, ',') &&
            std::getline(lineStream, cpuStr, ',') &&
            std::getline(lineStream, memStr, ',') &&
            std::getline(lineStream, execStr, ',') &&
            std::getline(lineStream, arrStr, ',')) {

            if (isHeader && (typeStr == "type" || cpuStr == "requiredCpu")) {
                isHeader = false;
                continue;
            }
            isHeader = false;

            TaskType type = TaskType::Batch;
            if (typeStr == "Priority" || typeStr == "3" || typeStr == "high") type = TaskType::Priority;
            else if (typeStr == "Interactive" || typeStr == "2" || typeStr == "medium") type = TaskType::Interactive;

            try {
                tasks.push_back({
                    idStr,
                    type,
                    std::stod(cpuStr),
                    std::stod(memStr),
                    std::stoi(execStr),
                    std::stoi(arrStr)
                });
            } catch (...) {
                continue;
            }
        }
    }

    if (tasks.empty()) {
        return "{\"error\":\"No valid tasks found in CSV\"}";
    }

    OptimizationGoal goal = OptimizationGoal::Balanced;
    if (goalStr == "lowest-cost") goal = OptimizationGoal::LowestCost;
    else if (goalStr == "lowest-wait") goal = OptimizationGoal::LowestWait;
    else if (goalStr == "priority-sla") goal = OptimizationGoal::PrioritySLA;

    BenchmarkReport report = StrategyEvaluator::evaluate(tasks, goal);

    std::stringstream out;
    out << "{"
        << "\"taskCount\":" << report.taskCount << ","
        << "\"reason\":\"" << report.reason << "\","
        << "\"winner\":{"
        << "\"strategyId\":\"" << report.winner.strategyId << "\","
        << "\"strategyName\":\"" << report.winner.strategyName << "\","
        << "\"compositeScore\":" << report.winner.compositeScore
        << "},"
        << "\"results\":[";

    for (size_t i = 0; i < report.results.size(); ++i) {
        const auto& r = report.results[i];
        out << "{"
            << "\"strategyId\":\"" << r.strategyId << "\","
            << "\"strategyName\":\"" << r.strategyName << "\","
            << "\"totalCost\":" << r.totalCost << ","
            << "\"averageWaitTimeMs\":" << r.averageWaitTimeMs << ","
            << "\"priorityWaitTimeMs\":" << r.priorityWaitTimeMs << ","
            << "\"makespanTicks\":" << r.makespanTicks << ","
            << "\"compositeScore\":" << r.compositeScore
            << "}" << (i + 1 < report.results.size() ? "," : "");
    }
    out << "]}";

    return out.str();
}

EMSCRIPTEN_BINDINGS(stratos_module) {
    function("evaluateWorkloadJson", &evaluateWorkloadJson);
    function("loadPlaybackCsv", &loadPlaybackCsv);
    function("tickPlayback", &tickPlayback);
    function("resetPlayback", &resetPlayback);
    function("getPlaybackSnapshot", &getPlaybackSnapshot);
}
