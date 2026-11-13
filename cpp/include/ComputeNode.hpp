#ifndef STRATOS_COMPUTE_NODE_HPP
#define STRATOS_COMPUTE_NODE_HPP

#include "Resource.hpp"
#include "Task.hpp"
#include <vector>
#include <memory>
#include <algorithm>

namespace stratos {

enum class NodeType {
    PhysicalServer,
    VirtualMachine
};

/**
 * @brief Abstract Base Class representing a physical or virtual machine in the cluster.
 * Demonstrates: Object Composition ("Has-A" Resource), Pure Virtual Methods, Polymorphic Billing.
 */
class ComputeNode {
protected:
    std::string id;
    std::string name;
    CPUResource cpu;
    MemoryResource memory;
    StorageResource storage;
    double costPerTick;
    std::vector<std::shared_ptr<Task>> runningTasks;
    int activeTicks;

public:
    ComputeNode(std::string nodeId, std::string nodeName,
                double cpuCap, double memCap, double storageCap, double initialCost)
        : id(std::move(nodeId)),
          name(std::move(nodeName)),
          cpu(cpuCap),
          memory(memCap),
          storage(storageCap),
          costPerTick(initialCost),
          activeTicks(0) {}

    virtual ~ComputeNode() = default;

    // Pure virtual methods (Polymorphism)
    virtual NodeType getNodeType() const noexcept = 0;
    virtual std::string getNodeTypeName() const noexcept = 0;
    virtual double calculateTickCost() noexcept = 0;

    // Composition & Resource Queries
    const std::string& getId() const noexcept { return id; }
    const std::string& getName() const noexcept { return name; }
    const CPUResource& getCpu() const noexcept { return cpu; }
    const MemoryResource& getMemory() const noexcept { return memory; }
    const StorageResource& getStorage() const noexcept { return storage; }
    double getCostPerTick() const noexcept { return costPerTick; }
    const std::vector<std::shared_ptr<Task>>& getRunningTasks() const noexcept { return runningTasks; }
    int getActiveTicks() const noexcept { return activeTicks; }

    double getUtilization() const noexcept {
        return cpu.getUtilization();
    }

    double getMemoryUtilization() const noexcept {
        return memory.getUtilization();
    }

    bool canFit(const Task& task) const noexcept {
        return cpu.canAllocate(task.getRequiredCpu()) &&
               memory.canAllocate(task.getRequiredMemory());
    }

    bool assignTask(const std::shared_ptr<Task>& task, int currentTick = 0) {
        if (!task || !canFit(*task)) {
            return false;
        }
        if (!cpu.allocate(task->getRequiredCpu())) return false;
        if (!memory.allocate(task->getRequiredMemory())) {
            cpu.release(task->getRequiredCpu());
            return false;
        }
        task->markRunning(id, currentTick);
        runningTasks.push_back(task);
        return true;
    }

    void freeResources(const std::shared_ptr<Task>& task) {
        if (!task) return;
        auto it = std::find_if(runningTasks.begin(), runningTasks.end(),
                               [&](const std::shared_ptr<Task>& t) { return t->getId() == task->getId(); });
        if (it != runningTasks.end()) {
            cpu.release((*it)->getRequiredCpu());
            memory.release((*it)->getRequiredMemory());
            runningTasks.erase(it);
        }
    }

    virtual void reset() noexcept {
        runningTasks.clear();
        activeTicks = 0;
        cpu.reset();
        memory.reset();
        storage.reset();
    }
};

/**
 * @brief Subclass: PhysicalServer (High static capacity, fixed cost per tick).
 */
class PhysicalServer : public ComputeNode {
private:
    double fixedCostPerTick;

public:
    PhysicalServer(std::string nodeId, std::string nodeName,
                   double cpuCap = 32.0, double memCap = 128.0,
                   double storageCap = 2000.0, double fixedCost = 1.85)
        : ComputeNode(std::move(nodeId), std::move(nodeName), cpuCap, memCap, storageCap, fixedCost),
          fixedCostPerTick(fixedCost) {}

    NodeType getNodeType() const noexcept override { return NodeType::PhysicalServer; }
    std::string getNodeTypeName() const noexcept override { return "PhysicalServer"; }

    double calculateTickCost() noexcept override {
        if (!runningTasks.empty()) {
            activeTicks++;
        }
        costPerTick = fixedCostPerTick;
        return fixedCostPerTick;
    }
};

/**
 * @brief Subclass: VirtualMachine (Elastic capacity, dynamic load-based cost scaling).
 */
class VirtualMachine : public ComputeNode {
private:
    double baseRatePerTick;

public:
    VirtualMachine(std::string nodeId, std::string nodeName,
                   double cpuCap = 8.0, double memCap = 32.0,
                   double storageCap = 500.0, double baseCost = 0.35)
        : ComputeNode(std::move(nodeId), std::move(nodeName), cpuCap, memCap, storageCap, baseCost),
          baseRatePerTick(baseCost) {}

    NodeType getNodeType() const noexcept override { return NodeType::VirtualMachine; }
    std::string getNodeTypeName() const noexcept override { return "VirtualMachine"; }

    double calculateTickCost() noexcept override {
        if (runningTasks.empty()) {
            costPerTick = baseRatePerTick * 0.20; // 80% discount when idle
            return costPerTick;
        }

        activeTicks++;
        double utilizationFactor = 1.0 + (getUtilization() / 100.0);
        double timeScaling = 1.0 + std::min(0.35, activeTicks * 0.005);
        costPerTick = baseRatePerTick * utilizationFactor * timeScaling;
        return costPerTick;
    }

    void reset() noexcept override {
        ComputeNode::reset();
        costPerTick = baseRatePerTick;
    }
};

} // namespace stratos

#endif // STRATOS_COMPUTE_NODE_HPP
