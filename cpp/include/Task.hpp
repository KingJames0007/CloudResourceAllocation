#ifndef STRATOS_TASK_HPP
#define STRATOS_TASK_HPP

#include <string>
#include <algorithm>
#include <optional>

namespace stratos {

enum class TaskStatus {
    Waiting,
    Running,
    Completed
};

enum class TaskType {
    Batch,
    Interactive,
    Priority
};

/**
 * @brief Abstract Base Class representing a unit of compute work.
 * Demonstrates: Polymorphism, Encapsulated State Machine, and Invariants.
 */
class Task {
protected:
    std::string id;
    double requiredCpu;
    double requiredMemory;
    int executionTime;
    int remainingTime;
    int arrivalTime;
    TaskStatus status;
    std::optional<int> startTime;
    std::optional<int> completionTime;
    std::string assignedNodeId;

public:
    Task(std::string taskId, double cpu, double memory, int duration, int arrival)
        : id(std::move(taskId)),
          requiredCpu(cpu),
          requiredMemory(memory),
          executionTime(duration),
          remainingTime(duration),
          arrivalTime(arrival),
          status(TaskStatus::Waiting),
          startTime(std::nullopt),
          completionTime(std::nullopt),
          assignedNodeId("") {}

    virtual ~Task() = default;

    // Pure virtual methods (Polymorphism)
    virtual int getPriority() const noexcept = 0;
    virtual TaskType getType() const noexcept = 0;
    virtual std::string getTypeName() const noexcept = 0;

    // Encapsulated state getters
    const std::string& getId() const noexcept { return id; }
    double getRequiredCpu() const noexcept { return requiredCpu; }
    double getRequiredMemory() const noexcept { return requiredMemory; }
    int getExecutionTime() const noexcept { return executionTime; }
    int getRemainingTime() const noexcept { return remainingTime; }
    int getArrivalTime() const noexcept { return arrivalTime; }
    TaskStatus getStatus() const noexcept { return status; }
    const std::string& getAssignedNodeId() const noexcept { return assignedNodeId; }

    // State Machine Transitions
    void markRunning(const std::string& nodeId, int currentTick) noexcept {
        status = TaskStatus::Running;
        assignedNodeId = nodeId;
        if (!startTime.has_value()) {
            startTime = currentTick;
        }
    }

    bool tickExecution() noexcept {
        if (status != TaskStatus::Running) {
            return false;
        }
        remainingTime = std::max(0, remainingTime - 1);
        return remainingTime == 0;
    }

    void markCompleted(int currentTick) noexcept {
        status = TaskStatus::Completed;
        remainingTime = 0;
        completionTime = currentTick;
    }

    int getWaitTimeTicks(int currentTick) const noexcept {
        if (startTime.has_value()) {
            return std::max(0, startTime.value() - arrivalTime);
        }
        return std::max(0, currentTick - arrivalTime);
    }
};

/**
 * @brief Subclass: BatchTask (Low Priority = 1, throughput oriented)
 */
class BatchTask : public Task {
public:
    BatchTask(std::string taskId, double cpu, double memory, int duration, int arrival)
        : Task(std::move(taskId), cpu, memory, duration, arrival) {}

    int getPriority() const noexcept override { return 1; }
    TaskType getType() const noexcept override { return TaskType::Batch; }
    std::string getTypeName() const noexcept override { return "Batch"; }
};

/**
 * @brief Subclass: InteractiveTask (Medium Priority = 2, API/Web oriented)
 */
class InteractiveTask : public Task {
public:
    InteractiveTask(std::string taskId, double cpu, double memory, int duration, int arrival)
        : Task(std::move(taskId), cpu, memory, duration, arrival) {}

    int getPriority() const noexcept override { return 2; }
    TaskType getType() const noexcept override { return TaskType::Interactive; }
    std::string getTypeName() const noexcept override { return "Interactive"; }
};

/**
 * @brief Subclass: PriorityTask (High Priority = 3, mission critical SLA)
 */
class PriorityTask : public Task {
public:
    PriorityTask(std::string taskId, double cpu, double memory, int duration, int arrival)
        : Task(std::move(taskId), cpu, memory, duration, arrival) {}

    int getPriority() const noexcept override { return 3; }
    TaskType getType() const noexcept override { return TaskType::Priority; }
    std::string getTypeName() const noexcept override { return "Priority"; }
};

} // namespace stratos

#endif // STRATOS_TASK_HPP
