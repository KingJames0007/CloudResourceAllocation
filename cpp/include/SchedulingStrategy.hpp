#ifndef STRATOS_SCHEDULING_STRATEGY_HPP
#define STRATOS_SCHEDULING_STRATEGY_HPP

#include "ComputeNode.hpp"
#include "Task.hpp"
#include <vector>
#include <memory>
#include <string>
#include <limits>
#include <algorithm>

namespace stratos {

struct Assignment {
    std::shared_ptr<Task> task;
    std::shared_ptr<ComputeNode> node;
};

/**
 * @brief Strategy Pattern Interface.
 * Demonstrates: Interface Segregation, Polymorphic Algorithm Dispatch.
 */
class SchedulingStrategy {
public:
    virtual ~SchedulingStrategy() = default;

    virtual std::string getId() const = 0;
    virtual std::string getName() const = 0;
    virtual std::string getDescription() const = 0;

    virtual std::vector<Assignment> schedule(
        const std::vector<std::shared_ptr<Task>>& taskQueue,
        const std::vector<std::shared_ptr<ComputeNode>>& computeNodes) = 0;

    virtual void reset() {}
};

namespace detail {
    struct NodeProjection {
        std::shared_ptr<ComputeNode> node;
        double projectedCpu;
        double projectedMemory;

        bool canFit(const Task& task) const noexcept {
            return (projectedCpu + task.getRequiredCpu() <= node->getCpu().getCapacity() + 1e-9) &&
                   (projectedMemory + task.getRequiredMemory() <= node->getMemory().getCapacity() + 1e-9);
        }

        void reserve(const Task& task) noexcept {
            projectedCpu += task.getRequiredCpu();
            projectedMemory += task.getRequiredMemory();
        }

        double getProjectedUtilization() const noexcept {
            return (projectedCpu / node->getCpu().getCapacity()) * 100.0;
        }
    };

    inline std::vector<NodeProjection> makeProjections(const std::vector<std::shared_ptr<ComputeNode>>& nodes) {
        std::vector<NodeProjection> proj;
        proj.reserve(nodes.size());
        for (const auto& node : nodes) {
            proj.push_back({node, node->getCpu().getAllocated(), node->getMemory().getAllocated()});
        }
        return proj;
    }
} // namespace detail

/**
 * @brief Concrete Strategy: Round Robin Scheduler (Fair sequential cycling).
 */
class RoundRobinScheduler : public SchedulingStrategy {
private:
    size_t nextIndex = 0;

public:
    std::string getId() const override { return "round-robin"; }
    std::string getName() const override { return "Round Robin"; }
    std::string getDescription() const override { return "Cycles through nodes sequentially for fair distribution"; }

    std::vector<Assignment> schedule(
        const std::vector<std::shared_ptr<Task>>& taskQueue,
        const std::vector<std::shared_ptr<ComputeNode>>& computeNodes) override {
        
        if (computeNodes.empty() || taskQueue.empty()) return {};

        auto projections = detail::makeProjections(computeNodes);
        std::vector<Assignment> assignments;

        for (const auto& task : taskQueue) {
            for (size_t offset = 0; offset < projections.size(); ++offset) {
                size_t idx = (nextIndex + offset) % projections.size();
                if (projections[idx].canFit(*task)) {
                    projections[idx].reserve(*task);
                    assignments.push_back({task, projections[idx].node});
                    nextIndex = (idx + 1) % projections.size();
                    break;
                }
            }
        }
        return assignments;
    }

    void reset() override { nextIndex = 0; }
};

/**
 * @brief Concrete Strategy: Priority Queue Scheduler (High-priority SLA first).
 */
class PriorityScheduler : public SchedulingStrategy {
public:
    std::string getId() const override { return "priority"; }
    std::string getName() const override { return "Priority Queue"; }
    std::string getDescription() const override { return "Dispatches highest priority tasks first"; }

    std::vector<Assignment> schedule(
        const std::vector<std::shared_ptr<Task>>& taskQueue,
        const std::vector<std::shared_ptr<ComputeNode>>& computeNodes) override {

        if (computeNodes.empty() || taskQueue.empty()) return {};

        auto projections = detail::makeProjections(computeNodes);
        auto sortedTasks = taskQueue;

        std::sort(sortedTasks.begin(), sortedTasks.end(),
                  [](const std::shared_ptr<Task>& a, const std::shared_ptr<Task>& b) {
                      if (a->getPriority() != b->getPriority()) {
                          return a->getPriority() > b->getPriority();
                      }
                      return a->getArrivalTime() < b->getArrivalTime();
                  });

        std::vector<Assignment> assignments;
        for (const auto& task : sortedTasks) {
            for (auto& proj : projections) {
                if (proj.canFit(*task)) {
                    proj.reserve(*task);
                    assignments.push_back({task, proj.node});
                    break;
                }
            }
        }
        return assignments;
    }
};

/**
 * @brief Concrete Strategy: Least Loaded Scheduler (Distributes workload to lowest CPU%).
 */
class LeastLoadedScheduler : public SchedulingStrategy {
public:
    std::string getId() const override { return "least-loaded"; }
    std::string getName() const override { return "Least Loaded"; }
    std::string getDescription() const override { return "Assigns tasks to node with lowest current utilization"; }

    std::vector<Assignment> schedule(
        const std::vector<std::shared_ptr<Task>>& taskQueue,
        const std::vector<std::shared_ptr<ComputeNode>>& computeNodes) override {

        if (computeNodes.empty() || taskQueue.empty()) return {};

        auto projections = detail::makeProjections(computeNodes);
        std::vector<Assignment> assignments;

        for (const auto& task : taskQueue) {
            detail::NodeProjection* bestCandidate = nullptr;
            double lowestUtil = std::numeric_limits<double>::infinity();

            for (auto& proj : projections) {
                if (!proj.canFit(*task)) continue;
                double util = std::max(proj.node->getUtilization(), proj.getProjectedUtilization());
                if (util < lowestUtil) {
                    lowestUtil = util;
                    bestCandidate = &proj;
                }
            }

            if (bestCandidate != nullptr) {
                bestCandidate->reserve(*task);
                assignments.push_back({task, bestCandidate->node});
            }
        }
        return assignments;
    }
};

/**
 * @brief Concrete Strategy: Cost-Aware Scheduler (Greedy assignment to cheapest eligible node).
 */
class CostAwareScheduler : public SchedulingStrategy {
public:
    std::string getId() const override { return "cost-aware"; }
    std::string getName() const override { return "Cost-Aware"; }
    std::string getDescription() const override { return "Packs tasks into lowest cost nodes first"; }

    std::vector<Assignment> schedule(
        const std::vector<std::shared_ptr<Task>>& taskQueue,
        const std::vector<std::shared_ptr<ComputeNode>>& computeNodes) override {

        if (computeNodes.empty() || taskQueue.empty()) return {};

        auto projections = detail::makeProjections(computeNodes);
        std::vector<Assignment> assignments;

        for (const auto& task : taskQueue) {
            detail::NodeProjection* cheapest = nullptr;
            double lowestCost = std::numeric_limits<double>::infinity();

            for (auto& proj : projections) {
                if (!proj.canFit(*task)) continue;
                if (proj.node->getCostPerTick() < lowestCost) {
                    lowestCost = proj.node->getCostPerTick();
                    cheapest = &proj;
                }
            }

            if (cheapest != nullptr) {
                cheapest->reserve(*task);
                assignments.push_back({task, cheapest->node});
            }
        }
        return assignments;
    }
};

/**
 * @brief Factory Method Pattern to instantiate strategy by ID string.
 */
inline std::unique_ptr<SchedulingStrategy> createScheduler(const std::string& strategyId) {
    if (strategyId == "priority") return std::make_unique<PriorityScheduler>();
    if (strategyId == "least-loaded") return std::make_unique<LeastLoadedScheduler>();
    if (strategyId == "cost-aware") return std::make_unique<CostAwareScheduler>();
    return std::make_unique<RoundRobinScheduler>();
}

} // namespace stratos

#endif // STRATOS_SCHEDULING_STRATEGY_HPP
