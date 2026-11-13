#include "Resource.hpp"
#include "ComputeNode.hpp"
#include "Task.hpp"
#include "SchedulingStrategy.hpp"
#include "ResourceManager.hpp"
#include "StrategyEvaluator.hpp"

#include <iostream>
#include <iomanip>

using namespace stratos;

void printReport(const BenchmarkReport& report, const std::string& title) {
    std::cout << "\n=========================================================================\n";
    std::cout << "  BENCHMARK: " << title << "\n";
    std::cout << "  Tasks: " << report.taskCount << " | WINNER: " << report.winner.strategyName 
              << " (" << std::fixed << std::setprecision(1) << report.winner.compositeScore << "/100)\n";
    std::cout << "=========================================================================\n";
    std::cout << std::left << std::setw(18) << "Strategy"
              << std::right << std::setw(12) << "Cost ($)"
              << std::setw(14) << "Avg Wait (ms)"
              << std::setw(16) << "Prio Wait (ms)"
              << std::setw(12) << "Makespan"
              << std::setw(10) << "Score\n";
    std::cout << "-------------------------------------------------------------------------\n";

    for (const auto& r : report.results) {
        std::cout << std::left << std::setw(18) << r.strategyName
                  << std::right << std::setw(12) << std::fixed << std::setprecision(2) << r.totalCost
                  << std::setw(14) << r.averageWaitTimeMs
                  << std::setw(16) << r.priorityWaitTimeMs
                  << std::setw(12) << r.makespanTicks
                  << std::setw(10) << std::fixed << std::setprecision(1) << r.compositeScore << "\n";
    }
    std::cout << "-------------------------------------------------------------------------\n";
    std::cout << "Verdict: " << report.reason << "\n";
}

int main(int argc, char* argv[]) {
    std::cout << "=========================================================================\n";
    std::cout << "  STRATOS CLOUDSIM: C++ OBJECT-ORIENTED SIMULATION ENGINE (C++17)\n";
    std::cout << "=========================================================================\n";

    // 1. Ingest generated CSV datasets or sample workload
    std::string csvPath = "datasets/01_priority_optimal_1000.csv";
    if (argc > 1) {
        csvPath = argv[1];
    }

    try {
        std::cout << "\n[1] Parsing Workload CSV: " << csvPath << " ...\n";
        auto tasks = StrategyEvaluator::parseCSV(csvPath);
        std::cout << "    Loaded " << tasks.size() << " valid tasks.\n";

        // 2. Evaluate under Priority SLA
        std::cout << "\n[2] Executing Head-to-Head Simulation across 4 Scheduling Strategies...\n";
        auto prioReport = StrategyEvaluator::evaluate(tasks, OptimizationGoal::PrioritySLA);
        printReport(prioReport, "Priority SLA Goal");

        // 3. Evaluate under Lowest Cost
        auto costReport = StrategyEvaluator::evaluate(tasks, OptimizationGoal::LowestCost);
        printReport(costReport, "Lowest Cost Goal");

    } catch (const std::exception& e) {
        std::cerr << "Error running C++ simulator: " << e.what() << "\n";
        std::cerr << "Falling back to in-memory synthetic workload test...\n";

        std::vector<TaskSpec> syntheticTasks = {
            {"T-01", TaskType::Batch, 4.0, 16.0, 6, 0},
            {"T-02", TaskType::Priority, 4.0, 12.0, 3, 0},
            {"T-03", TaskType::Interactive, 2.0, 8.0, 4, 0},
            {"T-04", TaskType::Batch, 6.0, 20.0, 8, 1},
            {"T-05", TaskType::Priority, 3.0, 8.0, 2, 1}
        };
        auto synthReport = StrategyEvaluator::evaluate(syntheticTasks, OptimizationGoal::Balanced);
        printReport(synthReport, "Synthetic 5-Task Workload");
    }

    return 0;
}
