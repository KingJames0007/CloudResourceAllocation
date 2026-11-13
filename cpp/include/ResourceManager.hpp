#ifndef STRATOS_RESOURCE_MANAGER_HPP
#define STRATOS_RESOURCE_MANAGER_HPP

#include "ComputeNode.hpp"
#include <vector>
#include <memory>
#include <numeric>

namespace stratos {

struct NodeTickResult {
    std::vector<std::shared_ptr<Task>> completedTasks;
    double tickCost;
};

/**
 * @brief Aggregate Root orchestrating the collection of ComputeNodes.
 * Demonstrates: Object Aggregation, Lifecycle Management.
 */
class ResourceManager {
private:
    std::vector<std::shared_ptr<ComputeNode>> nodes;

public:
    explicit ResourceManager(std::vector<std::shared_ptr<ComputeNode>> initialNodes = {})
        : nodes(std::move(initialNodes)) {
        if (nodes.empty()) {
            nodes = createDefaultCluster();
        }
    }

    static std::vector<std::shared_ptr<ComputeNode>> createDefaultCluster() {
        return {
            std::make_shared<PhysicalServer>("ps-01", "BareMetal Alpha", 32.0, 128.0, 2000.0, 1.85),
            std::make_shared<PhysicalServer>("ps-02", "BareMetal Beta", 32.0, 128.0, 2000.0, 1.85),
            std::make_shared<VirtualMachine>("vm-01", "Elastic VM-01", 8.0, 32.0, 500.0, 0.35),
            std::make_shared<VirtualMachine>("vm-02", "Elastic VM-02", 8.0, 32.0, 500.0, 0.35),
            std::make_shared<VirtualMachine>("vm-03", "Elastic VM-03", 12.0, 48.0, 750.0, 0.52),
            std::make_shared<VirtualMachine>("vm-04", "Elastic VM-04", 6.0, 24.0, 400.0, 0.28)
        };
    }

    const std::vector<std::shared_ptr<ComputeNode>>& getNodes() const noexcept {
        return nodes;
    }

    double getClusterCpuUtilization() const noexcept {
        double totalCap = 0.0;
        double totalAlloc = 0.0;
        for (const auto& node : nodes) {
            totalCap += node->getCpu().getCapacity();
            totalAlloc += node->getCpu().getAllocated();
        }
        if (totalCap <= 0.0) return 0.0;
        return (totalAlloc / totalCap) * 100.0;
    }

    double getClusterMemoryUtilization() const noexcept {
        double totalCap = 0.0;
        double totalAlloc = 0.0;
        for (const auto& node : nodes) {
            totalCap += node->getMemory().getCapacity();
            totalAlloc += node->getMemory().getAllocated();
        }
        if (totalCap <= 0.0) return 0.0;
        return (totalAlloc / totalCap) * 100.0;
    }

    int getTotalRunningTasks() const noexcept {
        int sum = 0;
        for (const auto& node : nodes) {
            sum += static_cast<int>(node->getRunningTasks().size());
        }
        return sum;
    }

    NodeTickResult tickAllNodes(int currentTick) {
        std::vector<std::shared_ptr<Task>> completed;
        double tickCost = 0.0;

        for (auto& node : nodes) {
            tickCost += node->calculateTickCost();

            // Snapshot active tasks to allow mutation during release
            auto activeTasks = node->getRunningTasks();
            for (auto& task : activeTasks) {
                bool isFinished = task->tickExecution();
                if (isFinished) {
                    task->markCompleted(currentTick);
                    node->freeResources(task);
                    completed.push_back(task);
                }
            }
        }
        return {completed, tickCost};
    }

    void reset() noexcept {
        for (auto& node : nodes) {
            node->reset();
        }
    }
};

} // namespace stratos

#endif // STRATOS_RESOURCE_MANAGER_HPP
