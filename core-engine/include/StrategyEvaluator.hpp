#ifndef STRATOS_STRATEGY_EVALUATOR_HPP
#define STRATOS_STRATEGY_EVALUATOR_HPP

#include "SchedulingStrategy.hpp"
#include "ResourceManager.hpp"
#include "Task.hpp"
#include <vector>
#include <memory>
#include <string>
#include <fstream>
#include <sstream>
#include <iostream>
#include <iomanip>

namespace stratos {

struct TaskSpec {
    std::string id;
    TaskType type;
    double requiredCpu;
    double requiredMemory;
    int executionTime;
    int arrivalTime;
};

enum class OptimizationGoal {
    Balanced,
    LowestCost,
    LowestWait,
    PrioritySLA
};

struct StrategyEvaluationResult {
    std::string strategyId;
    std::string strategyName;
    double totalCost;
    int averageWaitTimeMs;
    int priorityWaitTimeMs;
    int makespanTicks;
    double averageCpuUtilization;
    int completedTasks;
    int unscheduledTasks;
    double compositeScore;
};

struct BenchmarkReport {
    OptimizationGoal goal;
    size_t taskCount;
    StrategyEvaluationResult winner;
    StrategyEvaluationResult runnerUp;
    std::string reason;
    std::vector<StrategyEvaluationResult> results;
};

class StrategyEvaluator {
private:
    static constexpr int MAX_TICKS = 50000;
    static constexpr int MS_PER_TICK = 1000;

    static std::shared_ptr<Task> instantiate(const TaskSpec& spec) {
        if (spec.type == TaskType::Priority) {
            return std::make_shared<PriorityTask>(spec.id, spec.requiredCpu, spec.requiredMemory, spec.executionTime, spec.arrivalTime);
        }
        if (spec.type == TaskType::Interactive) {
            return std::make_shared<InteractiveTask>(spec.id, spec.requiredCpu, spec.requiredMemory, spec.executionTime, spec.arrivalTime);
        }
        return std::make_shared<BatchTask>(spec.id, spec.requiredCpu, spec.requiredMemory, spec.executionTime, spec.arrivalTime);
    }

public:
    static std::vector<TaskSpec> parseCSV(const std::string& filePath) {
        std::vector<TaskSpec> tasks;
        std::ifstream file(filePath);
        if (!file.is_open()) {
            throw std::runtime_error("Could not open CSV file: " + filePath);
        }

        std::string line;
        bool isHeader = true;
        while (std::getline(file, line)) {
            if (line.empty() || line[0] == '#') continue;
            std::stringstream ss(line);
            std::string idStr, typeStr, cpuStr, memStr, execStr, arrStr;

            if (std::getline(ss, idStr, ',') &&
                std::getline(ss, typeStr, ',') &&
                std::getline(ss, cpuStr, ',') &&
                std::getline(ss, memStr, ',') &&
                std::getline(ss, execStr, ',') &&
                std::getline(ss, arrStr, ',')) {

                if (isHeader && (typeStr == "type" || cpuStr == "requiredCpu")) {
                    isHeader = false;
                    continue;
                }
                isHeader = false;

                TaskType type = TaskType::Batch;
                if (typeStr == "Priority" || typeStr == "3" || typeStr == "high") type = TaskType::Priority;
                else if (typeStr == "Interactive" || typeStr == "2" || typeStr == "medium") type = TaskType::Interactive;

                tasks.push_back({
                    idStr,
                    type,
                    std::stod(cpuStr),
                    std::stod(memStr),
                    std::stoi(execStr),
                    std::stoi(arrStr)
                });
            }
        }
        return tasks;
    }

    static BenchmarkReport evaluate(const std::vector<TaskSpec>& taskSpecs, OptimizationGoal goal = OptimizationGoal::Balanced) {
        const std::vector<std::string> strategyIds = {
            "round-robin", "priority", "least-loaded", "cost-aware"
        };

        std::vector<StrategyEvaluationResult> rawResults;
        for (const auto& stratId : strategyIds) {
            rawResults.push_back(runSingle(stratId, taskSpecs));
        }

        // Multi-objective scoring
        double minCost = std::numeric_limits<double>::infinity();
        double maxCost = -1.0;
        int minWait = std::numeric_limits<int>::max(), maxWait = -1;
        int minPrio = std::numeric_limits<int>::max(), maxPrio = -1;
        int minMake = std::numeric_limits<int>::max(), maxMake = -1;

        for (const auto& r : rawResults) {
            minCost = std::min(minCost, r.totalCost); maxCost = std::max(maxCost, r.totalCost);
            minWait = std::min(minWait, r.averageWaitTimeMs); maxWait = std::max(maxWait, r.averageWaitTimeMs);
            minPrio = std::min(minPrio, r.priorityWaitTimeMs); maxPrio = std::max(maxPrio, r.priorityWaitTimeMs);
            minMake = std::min(minMake, r.makespanTicks); maxMake = std::max(maxMake, r.makespanTicks);
        }

        auto norm = [](double val, double minV, double maxV) {
            return (maxV == minV) ? 1.0 : (1.0 - (val - minV) / (maxV - minV));
        };

        double wCost = 0.35, wWait = 0.30, wPrio = 0.20, wMake = 0.15;
        if (goal == OptimizationGoal::LowestCost) { wCost = 0.70; wWait = 0.15; wPrio = 0.05; wMake = 0.10; }
        else if (goal == OptimizationGoal::LowestWait) { wCost = 0.10; wWait = 0.65; wPrio = 0.15; wMake = 0.10; }
        else if (goal == OptimizationGoal::PrioritySLA) { wCost = 0.10; wWait = 0.20; wPrio = 0.60; wMake = 0.10; }

        for (auto& r : rawResults) {
            double sCost = norm(r.totalCost, minCost, maxCost);
            double sWait = norm(r.averageWaitTimeMs, minWait, maxWait);
            double sPrio = norm(r.priorityWaitTimeMs, minPrio, maxPrio);
            double sMake = norm(r.makespanTicks, minMake, maxMake);
            double penalty = (r.unscheduledTasks > 0) ? 0.5 : 1.0;
            r.compositeScore = ((wCost * sCost) + (wWait * sWait) + (wPrio * sPrio) + (wMake * sMake)) * 100.0 * penalty;
        }

        std::sort(rawResults.begin(), rawResults.end(), [](const auto& a, const auto& b) {
            return a.compositeScore > b.compositeScore;
        });

        std::string reason = rawResults[0].strategyName + " achieved the highest composite score (" +
                             std::to_string(static_cast<int>(rawResults[0].compositeScore)) + "/100).";

        return {goal, taskSpecs.size(), rawResults[0], rawResults[1], reason, rawResults};
    }

private:
    static StrategyEvaluationResult runSingle(const std::string& strategyId, const std::vector<TaskSpec>& taskSpecs) {
        ResourceManager rm;
        auto strategy = createScheduler(strategyId);

        std::vector<std::shared_ptr<Task>> pending;
        pending.reserve(taskSpecs.size());
        for (const auto& s : taskSpecs) {
            pending.push_back(instantiate(s));
        }
        std::sort(pending.begin(), pending.end(), [](const auto& a, const auto& b) {
            return a->getArrivalTime() < b->getArrivalTime();
        });

        size_t pendingIdx = 0;
        std::vector<std::shared_ptr<Task>> waiting;
        std::vector<std::shared_ptr<Task>> completed;
        int tick = 0;
        double totalCost = 0.0;
        double cpuSum = 0.0;

        while ((pendingIdx < pending.size() || !waiting.empty() || rm.getTotalRunningTasks() > 0) && tick < MAX_TICKS) {
            while (pendingIdx < pending.size() && pending[pendingIdx]->getArrivalTime() <= tick) {
                waiting.push_back(pending[pendingIdx]);
                pendingIdx++;
            }

            auto tickResult = rm.tickAllNodes(tick);
            totalCost += tickResult.tickCost;
            for (auto& c : tickResult.completedTasks) {
                completed.push_back(c);
            }

            const auto& nodes = rm.getNodes();
            bool hasCapacity = false;
            for (const auto& n : nodes) {
                if (n->getCpu().getAvailable() >= 1.0 && n->getMemory().getAvailable() >= 1.0) {
                    hasCapacity = true; break;
                }
            }

            if (hasCapacity && !waiting.empty()) {
                auto assignments = strategy->schedule(waiting, nodes);
                std::vector<std::shared_ptr<Task>> unassigned;
                for (const auto& task : waiting) {
                    bool assigned = false;
                    for (const auto& asgn : assignments) {
                        if (asgn.task->getId() == task->getId()) {
                            if (asgn.node->assignTask(task, tick)) {
                                assigned = true;
                            }
                            break;
                        }
                    }
                    if (!assigned) unassigned.push_back(task);
                }
                waiting = std::move(unassigned);
            }

            cpuSum += rm.getClusterCpuUtilization();

            if (pendingIdx >= pending.size() && waiting.empty() && rm.getTotalRunningTasks() == 0) {
                break;
            }
            tick++;
        }

        long long totalWaitTicks = 0;
        long long priorityWaitTicks = 0;
        int prioCount = 0;

        for (const auto& t : completed) {
            int w = t->getWaitTimeTicks(tick);
            totalWaitTicks += w;
            if (t->getType() == TaskType::Priority) {
                priorityWaitTicks += w;
                prioCount++;
            }
        }

        int avgWaitMs = completed.empty() ? 0 : static_cast<int>((totalWaitTicks * MS_PER_TICK) / completed.size());
        int prioWaitMs = (prioCount == 0) ? avgWaitMs : static_cast<int>((priorityWaitTicks * MS_PER_TICK) / prioCount);

        return {
            strategyId,
            strategy->getName(),
            totalCost,
            avgWaitMs,
            prioWaitMs,
            tick,
            (cpuSum / std::max(1, tick + 1)),
            static_cast<int>(completed.size()),
            static_cast<int>(waiting.size() + (pending.size() - pendingIdx)),
            0.0
        };
    }
};

} // namespace stratos

#endif // STRATOS_STRATEGY_EVALUATOR_HPP
