#ifndef STRATOS_RESOURCE_HPP
#define STRATOS_RESOURCE_HPP

#include <string>
#include <stdexcept>
#include <algorithm>
#include <cmath>

namespace stratos {

/**
 * @brief Abstract Base Class representing a physical/virtual hardware resource.
 * Demonstrates: Encapsulation, Invariant Protection, and Pure Virtual Destructor.
 */
class Resource {
protected:
    double capacity;
    double allocated;
    std::string unit;

public:
    Resource(double cap, std::string u, double alloc = 0.0)
        : capacity(cap), unit(std::move(u)), allocated(0.0) {
        if (capacity <= 0.0) {
            throw std::invalid_argument("Resource capacity must be strictly positive.");
        }
        allocated = std::clamp(alloc, 0.0, capacity);
    }

    virtual ~Resource() = default;

    // Getters (Encapsulation)
    double getCapacity() const noexcept { return capacity; }
    double getAllocated() const noexcept { return allocated; }
    const std::string& getUnit() const noexcept { return unit; }

    double getAvailable() const noexcept {
        return std::max(0.0, capacity - allocated);
    }

    bool canAllocate(double amount) const noexcept {
        return amount >= 0.0 && (allocated + amount <= capacity + 1e-9);
    }

    bool allocate(double amount) noexcept {
        if (!canAllocate(amount)) {
            return false;
        }
        allocated = std::min(capacity, allocated + amount);
        return true;
    }

    void release(double amount) noexcept {
        allocated = std::max(0.0, allocated - amount);
    }

    double getUtilization() const noexcept {
        if (capacity <= 0.0) return 0.0;
        return (allocated / capacity) * 100.0;
    }

    void reset() noexcept {
        allocated = 0.0;
    }
};

/**
 * @brief Concrete Subclass for CPU Compute capacity (vCPUs).
 */
class CPUResource : public Resource {
public:
    explicit CPUResource(double cap, double alloc = 0.0)
        : Resource(cap, "vCPU", alloc) {}
};

/**
 * @brief Concrete Subclass for RAM Memory capacity (GB).
 */
class MemoryResource : public Resource {
public:
    explicit MemoryResource(double cap, double alloc = 0.0)
        : Resource(cap, "GB", alloc) {}
};

/**
 * @brief Concrete Subclass for Persistent Storage capacity (GB).
 */
class StorageResource : public Resource {
public:
    explicit StorageResource(double cap, double alloc = 0.0)
        : Resource(cap, "GB", alloc) {}
};

} // namespace stratos

#endif // STRATOS_RESOURCE_HPP
