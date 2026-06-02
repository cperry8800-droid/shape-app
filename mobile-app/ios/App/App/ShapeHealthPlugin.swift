import Foundation
import Capacitor
import HealthKit

// Thin in-app HealthKit plugin. Exposes read-only access to the handful of
// types Shape cares about (steps, heart rate, HRV, resting HR, active energy,
// distance, sleep, workouts) to the web layer via registerPlugin('ShapeHealth').
//
// Conforms to CAPBridgedPlugin so Capacitor auto-registers it from the app
// target — no .m registration file or external pod required.
@objc(ShapeHealthPlugin)
public class ShapeHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShapeHealthPlugin"
    public let jsName = "ShapeHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "querySamples", returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()
    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    // Map a JS sample name to its HKQuantityType + reporting unit.
    private func quantity(for name: String) -> (HKQuantityType, HKUnit)? {
        switch name {
        case "stepCount":
            return HKObjectType.quantityType(forIdentifier: .stepCount).map { ($0, HKUnit.count()) }
        case "heartRate", "restingHeartRate":
            let id: HKQuantityTypeIdentifier = name == "heartRate" ? .heartRate : .restingHeartRate
            return HKObjectType.quantityType(forIdentifier: id).map { ($0, HKUnit.count().unitDivided(by: .minute())) }
        case "heartRateVariabilitySDNN":
            return HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN).map { ($0, HKUnit.secondUnit(with: .milli)) }
        case "activeEnergyBurned":
            return HKObjectType.quantityType(forIdentifier: .activeEnergyBurned).map { ($0, HKUnit.kilocalorie()) }
        case "distanceWalkingRunning":
            return HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning).map { ($0, HKUnit.meter()) }
        default:
            return nil
        }
    }

    private func readTypes() -> Set<HKObjectType> {
        var types = Set<HKObjectType>()
        for id: HKQuantityTypeIdentifier in [.stepCount, .heartRate, .restingHeartRate, .heartRateVariabilitySDNN, .activeEnergyBurned, .distanceWalkingRunning] {
            if let t = HKObjectType.quantityType(forIdentifier: id) { types.insert(t) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(sleep) }
        types.insert(HKObjectType.workoutType())
        return types
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit is not available on this device.")
            return
        }
        healthStore.requestAuthorization(toShare: nil, read: readTypes()) { success, error in
            if let error = error { call.reject(error.localizedDescription); return }
            call.resolve(["granted": success])
        }
    }

    @objc func querySamples(_ call: CAPPluginCall) {
        guard let sampleName = call.getString("sampleName"),
              let startStr = call.getString("startDate"),
              let endStr = call.getString("endDate"),
              let start = Self.isoFormatter.date(from: startStr),
              let end = Self.isoFormatter.date(from: endStr) else {
            call.reject("sampleName, startDate and endDate are required.")
            return
        }
        let limit = call.getInt("limit") ?? 0
        let hkLimit = limit > 0 ? limit : HKObjectQueryNoLimit
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        if sampleName == "workoutType" {
            let q = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: hkLimit, sortDescriptors: [sort]) { _, samples, error in
                if let error = error { call.reject(error.localizedDescription); return }
                let out = (samples as? [HKWorkout] ?? []).map { w -> [String: Any] in
                    return [
                        "uuid": w.uuid.uuidString,
                        "activityName": Self.workoutName(w.workoutActivityType),
                        "startDate": Self.isoFormatter.string(from: w.startDate),
                        "endDate": Self.isoFormatter.string(from: w.endDate),
                        "duration": w.duration,
                        "totalEnergyBurned": w.totalEnergyBurned?.doubleValue(for: .kilocalorie()) as Any,
                        "totalDistance": w.totalDistance?.doubleValue(for: .meter()) as Any,
                    ]
                }
                call.resolve(["samples": out])
            }
            healthStore.execute(q)
            return
        }

        if sampleName == "sleepAnalysis" {
            guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
                call.resolve(["samples": []]); return
            }
            let q = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: hkLimit, sortDescriptors: [sort]) { _, samples, error in
                if let error = error { call.reject(error.localizedDescription); return }
                let out = (samples as? [HKCategorySample] ?? []).map { s -> [String: Any] in
                    return [
                        "sleepState": Self.sleepState(s.value),
                        "startDate": Self.isoFormatter.string(from: s.startDate),
                        "endDate": Self.isoFormatter.string(from: s.endDate),
                        "duration": s.endDate.timeIntervalSince(s.startDate),
                    ]
                }
                call.resolve(["samples": out])
            }
            healthStore.execute(q)
            return
        }

        guard let (type, unit) = quantity(for: sampleName) else {
            call.resolve(["samples": []]) // unsupported on this OS build — skip gracefully
            return
        }
        let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: hkLimit, sortDescriptors: [sort]) { _, samples, error in
            if let error = error { call.reject(error.localizedDescription); return }
            let out = (samples as? [HKQuantitySample] ?? []).map { s -> [String: Any] in
                return [
                    "value": s.quantity.doubleValue(for: unit),
                    "unit": unit.unitString,
                    "startDate": Self.isoFormatter.string(from: s.startDate),
                    "endDate": Self.isoFormatter.string(from: s.endDate),
                ]
            }
            call.resolve(["samples": out])
        }
        healthStore.execute(q)
    }

    private static func sleepState(_ value: Int) -> String {
        if #available(iOS 16.0, *) {
            switch value {
            case HKCategoryValueSleepAnalysis.inBed.rawValue: return "inBed"
            case HKCategoryValueSleepAnalysis.awake.rawValue: return "awake"
            case HKCategoryValueSleepAnalysis.asleepREM.rawValue: return "asleepREM"
            case HKCategoryValueSleepAnalysis.asleepDeep.rawValue: return "asleepDeep"
            case HKCategoryValueSleepAnalysis.asleepCore.rawValue: return "asleepCore"
            case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue: return "asleep"
            default: return "asleep"
            }
        }
        switch value {
        case HKCategoryValueSleepAnalysis.inBed.rawValue: return "inBed"
        case HKCategoryValueSleepAnalysis.awake.rawValue: return "awake"
        default: return "asleep"
        }
    }

    private static func workoutName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "running"
        case .walking: return "walking"
        case .cycling: return "cycling"
        case .swimming: return "swimming"
        case .traditionalStrengthTraining, .functionalStrengthTraining: return "strength training"
        case .highIntensityIntervalTraining: return "hiit"
        case .yoga: return "yoga"
        case .rowing: return "rowing"
        case .elliptical: return "elliptical"
        case .hiking: return "hiking"
        default: return "workout"
        }
    }
}
